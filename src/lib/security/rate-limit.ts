import "server-only";
import { db } from "@/lib/db";

/**
 * Fixed-window rate limiter persisted in RateLimitBucket (owner: architect-security).
 * Works across restarts and multiple processes sharing the same database.
 * Keys must not contain raw PII: use hashIp()/hashIdentifier() for identifiers.
 *
 * Usage: const r = await rateLimit(`lead:ip:${hashIp(ip)}`, 5, 60 * 60_000);
 *        if (!r.allowed) -> reject (HTTP 429 / generic message)
 */
export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterMs: number;
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  // Atomic on MySQL/MariaDB (InnoDB REPEATABLE READ does NOT serialise read-then-write transactions the way
  // SQLite did): one INSERT ... ON DUPLICATE KEY UPDATE decides "new window" vs "increment" under the row lock.
  // MySQL evaluates the SET list left to right, so `count` must be assigned before `windowStart`.
  const cutoff = new Date(now.getTime() - windowMs);
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO \`RateLimitBucket\` (\`key\`, \`count\`, \`windowStart\`, \`updatedAt\`)
      VALUES (${key}, 1, ${now}, ${now})
      ON DUPLICATE KEY UPDATE
        \`count\` = IF(\`windowStart\` <= ${cutoff}, 1, \`count\` + 1),
        \`windowStart\` = IF(\`windowStart\` <= ${cutoff}, ${now}, \`windowStart\`),
        \`updatedAt\` = ${now}`;
    const rows = await tx.$queryRaw<{ count: number; windowStart: Date }[]>`
      SELECT \`count\`, \`windowStart\` FROM \`RateLimitBucket\` WHERE \`key\` = ${key} FOR UPDATE`;
    const updated = { count: Number(rows[0]!.count), windowStart: new Date(rows[0]!.windowStart) };
    const allowed = updated.count <= limit;
    return {
      allowed,
      count: updated.count,
      remaining: Math.max(0, limit - updated.count),
      retryAfterMs: allowed ? 0 : Math.max(0, updated.windowStart.getTime() + windowMs - now.getTime()),
    };
  });
}

/** Read-only check (does not consume). */
export async function peekRateLimit(key: string, limit: number, windowMs: number, now: Date = new Date()) {
  const bucket = await db.rateLimitBucket.findUnique({ where: { key } });
  if (!bucket || now.getTime() - bucket.windowStart.getTime() >= windowMs) return { blocked: false, count: 0 };
  return { blocked: bucket.count >= limit, count: bucket.count };
}

export async function resetRateLimit(key: string): Promise<void> {
  await db.rateLimitBucket.deleteMany({ where: { key } });
}

/** Housekeeping: delete buckets older than maxAgeMs (call from a maintenance job). */
export async function pruneRateLimitBuckets(maxAgeMs = 24 * 60 * 60_000, now: Date = new Date()) {
  const { count } = await db.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: new Date(now.getTime() - maxAgeMs) } },
  });
  return count;
}
