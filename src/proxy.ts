// Owners: architect-security (admin UX redirect) + seo-content (public: host canonicalisation,
// DB-driven redirects / 410, global noindex outside production).
//
// Next 16 proxy runs on the Node.js runtime, so it can read the Redirect table (cached ~60 s,
// see src/lib/seo/redirects.ts). Redirects therefore apply to EVERY public URL before any route renders.
//
// /admin: UX-only. Redirects visitors WITHOUT a session cookie to the login page. It does NOT
// authorize anything — a forged/expired cookie passes here and is rejected by requireUser()/
// requireRole() server-side.
import { NextResponse, type NextRequest } from "next/server";
import { SITE_URL } from "@/lib/config/site";
import { canonicalHost, isIndexingEnabled } from "@/lib/seo/indexing";
import { GONE_HTML, resolveRedirect } from "@/lib/seo/redirects";

const COOKIE_NAMES = ["__Host-btnv_session", "btnv_session"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // ---- admin (unchanged behaviour) ----
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
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

  // ---- public ----
  const method = request.method;
  const safeMethod = method === "GET" || method === "HEAD";

  // 1. www -> apex, only when CANONICAL_HOST is configured (never on localhost / previews).
  const apex = canonicalHost();
  if (apex && safeMethod) {
    const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
    if (host === `www.${apex}`) {
      const origin = new URL(SITE_URL).host === apex ? SITE_URL : `https://${apex}`;
      return NextResponse.redirect(`${origin}${pathname}${search}`, 301);
    }
  }

  // 2. DB redirects and 410 Gone.
  if (safeMethod) {
    const hit = await resolveRedirect(pathname);
    if (hit) {
      if (hit.status === 410) {
        return withNoIndex(
          new NextResponse(method === "HEAD" ? null : GONE_HTML, {
            status: 410,
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
          }),
        );
      }
      const target = new URL(hit.to, request.url);
      if (!hit.to.includes("?") && search) target.search = search;
      return NextResponse.redirect(target, hit.status);
    }
  }

  // 3. Everything else: continue; keep non-production deployments out of search engines.
  const res = NextResponse.next();
  return isIndexingEnabled() ? res : withNoIndex(res);
}

function withNoIndex<T extends NextResponse>(res: T): T {
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = {
  // Everything except Next internals and static/media files (no DB lookup for assets).
  matcher: ["/((?!_next/|media/|brand/|images/|icons/|fonts/|favicon\\.ico|apple-icon\\.png|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml).*)"],
};
