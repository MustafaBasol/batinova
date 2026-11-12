"use server";

/**
 * Login / logout Server Actions (owner: architect-security).
 * Server Actions are POST-only and Origin-checked by Next.js (CSRF), and the
 * session cookie is SameSite=Lax. cms-admin imports `logoutAction` for its
 * "Se déconnecter" button: <form action={logoutAction}><button>…</button></form>
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/security/audit";
import { getClientIp } from "@/lib/security/ip";
import { GENERIC_LOGIN_ERROR, attemptLogin } from "./login";
import { safeNext } from "./redirect";
import { revokeSessionToken, sessionCookieName, sessionCookieOptions, validateSessionToken } from "./session";

export interface LoginFormState {
  error: string | null;
}

const LoginSchema = z.object({
  email: z.string().trim().max(254),
  password: z.string().max(256),
  next: z.string().max(512).optional(),
});

export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    next: (formData.get("next") as string | null) ?? undefined,
  });
  if (!parsed.success || !parsed.data.email || !parsed.data.password) {
    return { error: GENERIC_LOGIN_ERROR };
  }
  const h = await headers();
  const store = await cookies();
  const name = sessionCookieName();
  const result = await attemptLogin({
    email: parsed.data.email,
    password: parsed.data.password,
    ip: getClientIp(h),
    userAgent: h.get("user-agent"),
    previousToken: store.get(name)?.value,
  });
  if (!result.ok) return { error: result.error };

  store.set(name, result.token, sessionCookieOptions(result.expiresAt));
  redirect(safeNext(parsed.data.next));
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const name = sessionCookieName();
  const token = store.get(name)?.value;
  const session = await validateSessionToken(token);
  await revokeSessionToken(token);
  // Overwrite with identical attributes (Secure/Path) so __Host- cookies are cleared.
  store.set(name, "", { ...sessionCookieOptions(new Date(0)), maxAge: 0 });
  if (session) await audit(session.user.id, "auth.logout", { type: "User", id: session.user.id });
  redirect("/admin/login");
}
