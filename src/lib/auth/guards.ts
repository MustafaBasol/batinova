import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionCookieName, validateSessionToken, type SessionUser } from "./session";

/**
 * Authorization guards (owner: architect-security). THE ONLY way to authorize
 * admin work. Call them in EVERY admin Server Component, Server Action and
 * Route Handler — never rely on proxy.ts or on hidden UI.
 *
 *   const user = await requireUser();                // any active admin
 *   const owner = await requireRole("OWNER");        // OWNER only
 *   // Route handlers: { mode: "throw" } then catch AuthError -> authErrorResponse(e)
 *
 * Role hierarchy: OWNER > EDITOR. requireRole("EDITOR") admits both.
 */
export type Role = "OWNER" | "EDITOR";
export type { SessionUser };

const RANK: Record<Role, number> = { EDITOR: 1, OWNER: 2 };

export const LOGIN_PATH = "/admin/login";

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message = status === 401 ? "Non authentifié" : "Accès refusé",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function hasRole(user: Pick<SessionUser, "role"> | null | undefined, role: Role): boolean {
  return !!user && RANK[user.role] >= RANK[role];
}

/** Pure check — throws AuthError(403) if the user lacks the role. */
export function assertRole(user: SessionUser, role: Role): SessionUser {
  if (!hasRole(user, role)) throw new AuthError(403);
  return user;
}

/** Current admin user from the session cookie (request-deduplicated), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  const res = await validateSessionToken(token);
  return res?.user ?? null;
});

type GuardMode = { mode?: "redirect" | "throw" };

export async function requireUser(opts: GuardMode = {}): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    if (opts.mode === "throw") throw new AuthError(401);
    redirect(LOGIN_PATH);
  }
  return user;
}

/**
 * Requires a minimum role. Unauthenticated -> redirect to login (or AuthError 401
 * in throw mode). Authenticated but insufficient -> AuthError 403 in throw mode,
 * or a redirect to /admin?refus=1 in redirect mode.
 */
export async function requireRole(role: Role, opts: GuardMode = {}): Promise<SessionUser> {
  const user = await requireUser(opts);
  if (!hasRole(user, role)) {
    if (opts.mode === "throw") throw new AuthError(403);
    redirect("/admin?refus=1");
  }
  return user;
}

/** JSON response for Route Handlers catching AuthError. */
export function authErrorResponse(err: unknown): Response {
  const status = err instanceof AuthError ? err.status : 500;
  const message = err instanceof AuthError ? err.message : "Erreur interne";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
