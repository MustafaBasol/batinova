import { runRetentionPurge } from "@/lib/maintenance";
import { checkMaintenanceToken } from "@/lib/security/maintenance-token";
import { getClientIp, hashIp } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * Retention purge for Hostinger Cron Jobs (owner: architect-security). Cron jobs do not receive the site's
 * environment variables, so the cron calls the running app:
 *   curl -fsS -X POST -H @/home/<user>/batinova-private/purge-header https://btnv.fr/api/maintenance/purge
 * - 404 unless MAINTENANCE_TOKEN is set (>= 32 random chars); POST only; constant-time token comparison.
 * - Wrong tokens are throttled per client IP bucket; a valid token is never blocked by that throttle.
 * - Returns counts only (no personal data). Never cached, never indexed.
 */
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };

export async function POST(request: Request) {
  const auth = checkMaintenanceToken(request.headers.get("authorization"));
  if (auth === "disabled") return new Response(null, { status: 404, headers });
  if (auth === "denied") {
    const r = await rateLimit(`maintenance:ip:${hashIp(getClientIp(request.headers))}`, 10, 15 * 60_000);
    return new Response(null, { status: r.allowed ? 401 : 429, headers: r.allowed ? headers : { ...headers, "retry-after": String(Math.ceil(r.retryAfterMs / 1000)) } });
  }
  try {
    const summary = await runRetentionPurge({ actorId: null });
    console.log(`[maintenance:purge] ${new Date().toISOString()} leads=${summary.leads} sessions=${summary.sessions} rateLimitBuckets=${summary.rateLimitBuckets}`);
    return Response.json({ ok: true, ...summary }, { headers });
  } catch {
    console.error("[maintenance:purge] failed");
    return Response.json({ ok: false }, { status: 500, headers });
  }
}

export function GET() {
  return new Response(null, { status: 404, headers });
}
