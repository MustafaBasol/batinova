import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { hashIdentifier, hashIp } from "@/lib/security/ip";
import { rateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { verifyDummy, verifyPassword } from "./password";
import { createSession, revokeSessionToken } from "./session";

/**
 * Login with throttling and lockout (owner: architect-security).
 * Layers:
 *  1. per-IP-hash bucket: LOGIN_IP_LIMIT attempts / LOGIN_WINDOW_MS
 *  2. per-email-hash bucket: LOGIN_EMAIL_LIMIT attempts / LOGIN_WINDOW_MS
 *  3. account lockout: after LOCKOUT_THRESHOLD consecutive failures the account
 *     is locked with exponential backoff (15 min, 30 min, 1 h … capped 24 h).
 * Every failure returns the same generic message; unknown e-mails still pay
 * the cost of an Argon2 verification.
 */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_IP_LIMIT = 20;
export const LOGIN_EMAIL_LIMIT = 10;
export const LOCKOUT_THRESHOLD = 5;
const LOCK_BASE_MS = 15 * 60 * 1000;
const LOCK_MAX_MS = 24 * 60 * 60 * 1000;

export const GENERIC_LOGIN_ERROR = "Identifiants invalides ou compte temporairement indisponible.";
export const THROTTLED_LOGIN_ERROR = "Trop de tentatives. Réessayez plus tard.";

export function lockDurationMs(failedCount: number): number {
  if (failedCount < LOCKOUT_THRESHOLD) return 0;
  return Math.min(LOCK_MAX_MS, LOCK_BASE_MS * 2 ** (failedCount - LOCKOUT_THRESHOLD));
}

export interface LoginInput {
  email: string;
  password: string;
  ip: string;
  userAgent?: string | null;
  /** Existing session token (if any) — revoked on success (rotation). */
  previousToken?: string | null;
  now?: Date;
}

export type LoginResult =
  | { ok: true; userId: string; token: string; expiresAt: Date }
  | { ok: false; error: string; reason: "throttled" | "invalid" };

export async function attemptLogin(input: LoginInput): Promise<LoginResult> {
  const now = input.now ?? new Date();
  const email = String(input.email ?? "").trim().toLowerCase().slice(0, 254);
  const password = String(input.password ?? "");

  const ipKey = `login:ip:${hashIp(input.ip)}`;
  const emailKey = `login:email:${hashIdentifier("email", email)}`;
  const [ipRes, emailRes] = await Promise.all([
    rateLimit(ipKey, LOGIN_IP_LIMIT, LOGIN_WINDOW_MS, now),
    rateLimit(emailKey, LOGIN_EMAIL_LIMIT, LOGIN_WINDOW_MS, now),
  ]);
  if (!ipRes.allowed || !emailRes.allowed) {
    await verifyDummy(password);
    await audit(null, "auth.login_throttled", null, { scope: !ipRes.allowed ? "ip" : "account" });
    return { ok: false, error: THROTTLED_LOGIN_ERROR, reason: "throttled" };
  }

  const user = email ? await db.user.findUnique({ where: { email } }) : null;
  if (!user || !user.active) {
    await verifyDummy(password);
    await audit(null, "auth.login_failed", null, { known: false });
    return { ok: false, error: GENERIC_LOGIN_ERROR, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > now.getTime()) {
    await verifyDummy(password);
    await audit(user.id, "auth.login_locked", { type: "User", id: user.id });
    return { ok: false, error: GENERIC_LOGIN_ERROR, reason: "invalid" };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lockMs = lockDurationMs(failed);
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: failed, lockedUntil: lockMs ? new Date(now.getTime() + lockMs) : null },
    });
    await audit(user.id, "auth.login_failed", { type: "User", id: user.id }, { count: failed, locked: lockMs > 0 });
    return { ok: false, error: GENERIC_LOGIN_ERROR, reason: "invalid" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
  });
  await revokeSessionToken(input.previousToken);
  await resetRateLimit(emailKey);
  const { token, expiresAt } = await createSession(user.id, input.userAgent, now);
  await audit(user.id, "auth.login", { type: "User", id: user.id });
  return { ok: true, userId: user.id, token, expiresAt };
}
