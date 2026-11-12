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
  return db.$transaction(async (tx) => {
    const bucket = await tx.rateLimitBucket.findUnique({ where: { key } });
    const expired = !bucket || now.getTime() - bucket.windowStart.getTime() >= windowMs;
    const updated = expired
      ? await tx.rateLimitBucket.upsert({
          where: { key },
          create: { key, count: 1, windowStart: now },
          update: { count: 1, windowStart: now },
        })
      : await tx.rateLimitBucket.update({ where: { key }, data: { count: { increment: 1 } } });
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
