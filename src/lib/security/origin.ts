import "server-only";
import { SITE_URL } from "@/lib/config/site";

/**
 * CSRF defence for Route Handlers that mutate state (POST/PUT/PATCH/DELETE)
 * (owner: architect-security).
 *
 * Server Actions are already protected by Next.js (POST-only + Origin vs Host
 * comparison), so they do NOT need this. Route handlers DO.
 * Session cookies are SameSite=Lax, which is a second layer.
 *
 * Accepts when Origin (or, if absent, Referer) matches the request host or the
 * canonical SITE_URL origin. Requests without either header are rejected.
 */
export class ForbiddenOriginError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden origin");
  }
}

export function isSameOrigin(request: Request): boolean {
  const allowed = new Set<string>([SITE_URL]);
  const host = request.headers.get("host");
  if (host) {
    const proto = new URL(request.url).protocol === "https:" ? "https" : "http";
    allowed.add(`${proto}://${host}`);
    if (process.env.TRUST_PROXY === "true") allowed.add(`https://${host}`);
  }
  try {
    allowed.add(new URL(request.url).origin);
  } catch {
    /* ignore */
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") return allowed.has(origin);
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return allowed.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }
  return false;
}

export function assertSameOrigin(request: Request): void {
  if (!isSameOrigin(request)) throw new ForbiddenOriginError();
}
