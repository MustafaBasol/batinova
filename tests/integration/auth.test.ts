import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, db } from "../support/db";

// next/headers + next/navigation mocks for the guard tests
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { hashPassword, passwordPolicyError, verifyPassword } from "@/lib/auth/password";
import {
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
  createSession,
  revokeAllUserSessions,
  revokeSessionToken,
  sessionCookieName,
  validateSessionToken,
} from "@/lib/auth/session";
import { GENERIC_LOGIN_ERROR, LOCKOUT_THRESHOLD, LOGIN_EMAIL_LIMIT, attemptLogin, lockDurationMs } from "@/lib/auth/login";
import { AuthError, assertRole, hasRole, requireRole, requireUser } from "@/lib/auth/guards";
import { rateLimit } from "@/lib/security/rate-limit";

const PASSWORD = "correct horse battery staple";

async function makeUser(role: "OWNER" | "EDITOR" = "OWNER", email = `${role.toLowerCase()}@example.test`) {
  return db.user.create({ data: { email, name: role, role, passwordHash: await hashPassword(PASSWORD) } });
}

beforeEach(async () => {
  cookieJar.clear();
  await resetDb();
});

describe("password hashing", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword(PASSWORD);
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, PASSWORD)).toBe(true);
    expect(await verifyPassword(h, "wrong password!!")).toBe(false);
    expect(await verifyPassword("not-a-hash", PASSWORD)).toBe(false);
  });

  it("enforces the 12-character minimum", async () => {
    expect(passwordPolicyError("short")).toMatch(/12/);
    await expect(hashPassword("short")).rejects.toThrow();
  });
});

describe("sessions", () => {
  it("creates, validates and stores only a hash of the token", async () => {
    const user = await makeUser();
    const { token } = await createSession(user.id, "UA".repeat(300));
    const row = await db.session.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.userAgent!.length).toBeLessThanOrEqual(200);
    const res = await validateSessionToken(token);
    expect(res?.user).toMatchObject({ id: user.id, role: "OWNER" });
  });

  it("expires after the absolute lifetime and after idle timeout", async () => {
    const user = await makeUser();
    const t0 = new Date("2026-11-12T08:00:00Z");
    const a = await createSession(user.id, null, t0);
    expect(await validateSessionToken(a.token, new Date(t0.getTime() + SESSION_IDLE_MS + 1000))).toBeNull();
    expect(await db.session.count()).toBe(0); // expired session is deleted

    const b = await createSession(user.id, null, t0);
    // keep it alive with activity, then hit the absolute limit
    let t = t0.getTime();
    while (t < t0.getTime() + SESSION_ABSOLUTE_MS - SESSION_IDLE_MS) {
      t += SESSION_IDLE_MS - 60_000;
      expect(await validateSessionToken(b.token, new Date(t))).not.toBeNull();
    }
    expect(await validateSessionToken(b.token, new Date(t0.getTime() + SESSION_ABSOLUTE_MS + 1))).toBeNull();
  });

  it("revokes on logout and for all user sessions; inactive users are rejected", async () => {
    const user = await makeUser();
    const a = await createSession(user.id);
    const b = await createSession(user.id);
    await revokeSessionToken(a.token);
    expect(await validateSessionToken(a.token)).toBeNull();
    expect(await validateSessionToken(b.token)).not.toBeNull();
    expect(await revokeAllUserSessions(user.id)).toBe(1);
    const c = await createSession(user.id);
    await db.user.update({ where: { id: user.id }, data: { active: false } });
    expect(await validateSessionToken(c.token)).toBeNull();
  });

  it("rejects garbage tokens", async () => {
    expect(await validateSessionToken("")).toBeNull();
    expect(await validateSessionToken("x".repeat(43))).toBeNull();
  });
});

describe("login throttling and lockout", () => {
  it("succeeds with the right password and rotates the previous session", async () => {
    const user = await makeUser();
    const old = await createSession(user.id);
    const res = await attemptLogin({ email: "OWNER@example.test ", password: PASSWORD, ip: "1.2.3.4", previousToken: old.token });
    expect(res.ok).toBe(true);
    expect(await validateSessionToken(old.token)).toBeNull();
    const audit = await db.auditLog.findFirst({ where: { action: "auth.login" } });
    expect(audit?.actorId).toBe(user.id);
  });

  it("returns the same generic error for unknown e-mail and wrong password", async () => {
    await makeUser();
    const unknown = await attemptLogin({ email: "nobody@example.test", password: PASSWORD, ip: "1.1.1.1" });
    const wrong = await attemptLogin({ email: "owner@example.test", password: "wrong-password-123", ip: "1.1.1.2" });
    expect(unknown).toEqual({ ok: false, error: GENERIC_LOGIN_ERROR, reason: "invalid" });
    expect(wrong).toEqual(unknown);
  });

  it("locks the account after repeated failures, even for the correct password", async () => {
    const user = await makeUser();
    const t = new Date("2026-11-12T09:00:00Z");
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await attemptLogin({ email: user.email, password: `wrong-password-${i}`, ip: `10.0.0.${i}`, now: t });
    }
    const locked = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(locked.failedLoginCount).toBe(LOCKOUT_THRESHOLD);
    expect(locked.lockedUntil!.getTime()).toBe(t.getTime() + lockDurationMs(LOCKOUT_THRESHOLD));
    const during = await attemptLogin({ email: user.email, password: PASSWORD, ip: "10.0.1.1", now: new Date(t.getTime() + 60_000) });
    expect(during.ok).toBe(false);
    const after = await attemptLogin({
      email: user.email,
      password: PASSWORD,
      ip: "10.0.1.2",
      now: new Date(t.getTime() + lockDurationMs(LOCKOUT_THRESHOLD) + 16 * 60_000),
    });
    expect(after.ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginCount).toBe(0);
  });

  it("lockout backoff grows and is capped", () => {
    expect(lockDurationMs(LOCKOUT_THRESHOLD - 1)).toBe(0);
    expect(lockDurationMs(LOCKOUT_THRESHOLD + 1)).toBe(2 * lockDurationMs(LOCKOUT_THRESHOLD));
    expect(lockDurationMs(50)).toBe(24 * 60 * 60 * 1000);
  });

  it("throttles per e-mail across IPs", async () => {
    const t = new Date("2026-11-12T09:00:00Z");
    let last;
    for (let i = 0; i <= LOGIN_EMAIL_LIMIT; i++) {
      last = await attemptLogin({ email: "target@example.test", password: "whatever-123456", ip: `172.16.0.${i}`, now: t });
    }
    expect(last).toMatchObject({ ok: false, reason: "throttled" });
  });

  it("rateLimit resets after the window", async () => {
    const t = new Date("2026-11-12T09:00:00Z");
    expect((await rateLimit("k", 1, 1000, t)).allowed).toBe(true);
    expect((await rateLimit("k", 1, 1000, t)).allowed).toBe(false);
    expect((await rateLimit("k", 1, 1000, new Date(t.getTime() + 1000))).allowed).toBe(true);
  });
});

describe("guards", () => {
  it("hasRole / assertRole: EDITOR cannot do OWNER work", () => {
    const editor = { id: "e", email: "e@x", name: "E", role: "EDITOR" as const };
    expect(hasRole(editor, "EDITOR")).toBe(true);
    expect(hasRole(editor, "OWNER")).toBe(false);
    expect(() => assertRole(editor, "OWNER")).toThrow(AuthError);
  });

  it("requireRole('OWNER') denies an authenticated EDITOR and admits OWNER", async () => {
    const editor = await makeUser("EDITOR");
    const s = await createSession(editor.id);
    cookieJar.set(sessionCookieName(), s.token);
    await expect(requireRole("OWNER", { mode: "throw" })).rejects.toMatchObject({ status: 403 });
    await expect(requireRole("OWNER")).rejects.toThrow("REDIRECT:/admin?refus=1");
    await expect(requireRole("EDITOR", { mode: "throw" })).resolves.toMatchObject({ id: editor.id });

    const owner = await makeUser("OWNER");
    const o = await createSession(owner.id);
    cookieJar.set(sessionCookieName(), o.token);
    await expect(requireRole("OWNER", { mode: "throw" })).resolves.toMatchObject({ role: "OWNER" });
  });

  it("requireUser redirects / throws 401 without a valid session", async () => {
    await expect(requireUser()).rejects.toThrow("REDIRECT:/admin/login");
    cookieJar.set(sessionCookieName(), "forged-token-value-forged-token-value-1234");
    await expect(requireUser({ mode: "throw" })).rejects.toMatchObject({ status: 401 });
  });
});
