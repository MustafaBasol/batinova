// Owner: architect-security.
// UX-only: redirects visitors WITHOUT a session cookie away from /admin pages to
// the login page. It does NOT authorize anything — a forged/expired cookie
// passes here and is rejected by requireUser()/requireRole() server-side.
// seo-content may extend this file for DB-driven redirects (coordinate first).
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAMES = ["__Host-btnv_session", "btnv_session"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return withNoIndex(NextResponse.next());
  }
  const hasCookie = COOKIE_NAMES.some((n) => request.cookies.has(n));
  if (!hasCookie) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    const next = `${pathname}${search}`;
    if (next !== "/admin") url.searchParams.set("next", next);
    return withNoIndex(NextResponse.redirect(url));
  }
  return withNoIndex(NextResponse.next());
}

function withNoIndex(res: NextResponse) {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
