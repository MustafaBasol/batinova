import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { serverEnv } from "@/lib/config/env";
import { db } from "@/lib/db";
import { truncateUserAgent } from "@/lib/security/ip";

/**
 * Database sessions (owner: architect-security).
 * - token: 32 random bytes (base64url) in an httpOnly cookie; only its
 *   HMAC-SHA256(SESSION_SECRET) is stored (Session.tokenHash), so a DB leak does
 *   not leak usable sessions. Rotating SESSION_SECRET logs everyone out.
 * - idle timeout (SESSION_IDLE_MS) + absolute lifetime (SESSION_ABSOLUTE_MS).
 * - a new token is issued at every login (rotation); logout deletes the row.
 */
export const SESSION_IDLE_MS = 4 * 60 * 60 * 1000; // 4 h without activity
export const SESSION_ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export const isSecureCookieEnv = () => process.env.NODE_ENV === "production";
/** `__Host-` prefix in production (requires Secure, Path=/, no Domain). */
export const sessionCookieName = () => (isSecureCookieEnv() ? "__Host-btnv_session" : "btnv_session");

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    secure: isSecureCookieEnv(),
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function hashSessionToken(token: string): string {
  return createHmac("sha256", serverEnv().SESSION_SECRET).update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: "OWNER" | "EDITOR";
}

export async function createSession(userId: string, userAgent?: string | null, now: Date = new Date()) {
  const token = generateSessionToken();
  const expiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_MS);
  await db.session.create({
    data: {
      tokenHash: hashSessionToken(token),
      userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      userAgent: truncateUserAgent(userAgent),
    },
  });
  return { token, expiresAt };
}

/** Returns the user for a valid token, or null (expired / idle / revoked / inactive user). */
export async function validateSessionToken(
  token: string | undefined | null,
  now: Date = new Date(),
): Promise<{ sessionId: string; user: SessionUser; expiresAt: Date } | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const tokenHash = hashSessionToken(token);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, name: true, role: true, active: true } } },
  });
  if (!session) return null;
  const t = now.getTime();
  const idleExpired = t - session.lastSeenAt.getTime() > SESSION_IDLE_MS;
  if (session.expiresAt.getTime() <= t || idleExpired || !session.user.active) {
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (t - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  const { active: _active, ...user } = session.user;
  void _active;
  return { sessionId: session.id, user, expiresAt: session.expiresAt };
}

export async function revokeSessionToken(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

/** Revoke every session of a user (password change, deactivation, role change). */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { userId } });
  return count;
}

export async function pruneExpiredSessions(now: Date = new Date()): Promise<number> {
  const { count } = await db.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lt: new Date(now.getTime() - SESSION_IDLE_MS) } }],
    },
  });
  return count;
}
