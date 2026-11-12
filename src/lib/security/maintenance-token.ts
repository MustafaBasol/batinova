import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { isWeakSecret } from "@/lib/config/production";

/**
 * Bearer-token check for machine endpoints (cron). Constant-time (compares SHA-256 digests); the endpoint
 * does not exist (404) unless MAINTENANCE_TOKEN is set and strong.
 */
export type MaintenanceAuth = "disabled" | "ok" | "denied";

export function checkMaintenanceToken(authorization: string | null, configured: string | undefined = process.env.MAINTENANCE_TOKEN): MaintenanceAuth {
  if (!configured || isWeakSecret(configured)) return "disabled";
  const m = /^Bearer (\S{1,512})$/.exec(authorization ?? "");
  if (!m) return "denied";
  const a = createHash("sha256").update(m[1]!).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b) ? "ok" : "denied";
}
