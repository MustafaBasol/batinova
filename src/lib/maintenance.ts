import "server-only";
import { pruneExpiredSessions } from "@/lib/auth/session";
import { purgeExpiredLeads } from "@/lib/leads/retention";
import { pruneRateLimitBuckets } from "@/lib/security/rate-limit";

export interface PurgeSummary {
  leads: number;
  sessions: number;
  rateLimitBuckets: number;
}

/** Retention purge shared by the CLI (`npm run maintenance:purge`) and the OWNER admin action. */
export async function runRetentionPurge(opts: { actorId?: string | null; now?: Date } = {}): Promise<PurgeSummary> {
  const now = opts.now ?? new Date();
  const leads = await purgeExpiredLeads(now, opts.actorId ?? null);
  const sessions = await pruneExpiredSessions(now);
  const rateLimitBuckets = await pruneRateLimitBuckets(undefined, now);
  return { leads, sessions, rateLimitBuckets };
}
