import "server-only";
import { db } from "@/lib/db";
import { publishedWhere } from "@/lib/content/publish";
import { toPagePath, SLUG_RE, RESERVED_SEGMENTS } from "@/lib/content/paths";

/**
 * Server-rendered 404 for public URLs (owner: seo-content / design-frontend).
 *
 * Why: in Next 16.4.6 a `notFound()` thrown while rendering a dynamic page makes the framework answer with
 * status 404 and its error-recovery shell `<html id="__next_error__">` with an EMPTY body; the real 404 UI is
 * only painted client-side (verified in dev and prod, with the default not-found, without project code,
 * with a segment-level not-found.tsx; the shell is hard-coded in app-render `getErrorRSCPayload`).
 * Without JavaScript the visitor therefore saw a blank page.
 *
 * Fix: src/proxy.ts (Node.js runtime) asks `isMissingPublicPath` BEFORE rendering. For URLs that the page
 * routes would answer with notFound(), the proxy returns the static French HTML below with HTTP 404 +
 * noindex. It uses the very same publication rule (`publishedWhere`) as the routes. The routes keep their
 * own `notFound()` as the authoritative fallback (race conditions, JS clients), so a false negative here
 * only degrades to the previous behaviour; a false positive is guarded by tests.
 */

const STATIC_ROUTES = new Set(["/", "/blog", "/devis", "/realisations"]);
const SLUG_MAX_LEN = 80;

export function splitPath(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

/** True only when the route tree would certainly call notFound() for this pathname. */
export async function isMissingPublicPath(pathname: string): Promise<boolean> {
  let p = pathname;
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (STATIC_ROUTES.has(p)) return false;
  let segs: string[];
  try {
    segs = splitPath(p).map((s) => decodeURIComponent(s));
  } catch {
    return true; // malformed percent-encoding: no content can match
  }
  const [first] = segs;
  if (!first) return false;
  const slugOk = (s: string | undefined): s is string => !!s && s.length <= SLUG_MAX_LEN && SLUG_RE.test(s);

  if (first === "blog") {
    if (segs.length === 2) {
      const slug = segs[1];
      if (!slugOk(slug)) return true;
      return !(await db.post.findFirst({ where: { slug, ...publishedWhere() }, select: { id: true } }));
    }
    if (segs.length === 3 && (segs[1] === "categorie" || segs[1] === "etiquette")) {
      const slug = segs[2];
      if (!slugOk(slug)) return true;
      const where = { slug, deletedAt: null };
      const hit =
        segs[1] === "categorie"
          ? await db.category.findFirst({ where, select: { id: true } })
          : await db.tag.findFirst({ where, select: { id: true } });
      return !hit;
    }
    return true; // any other /blog/... shape has no route; the catch-all rejects reserved segments
  }
  if (first === "realisations") {
    if (segs.length !== 2) return true;
    const slug = segs[1];
    if (!slugOk(slug)) return true;
    return !(await db.project.findFirst({ where: { slug, ...publishedWhere() }, select: { id: true } }));
  }
  if (RESERVED_SEGMENTS.has(first)) return false; // code routes (devis/*, api, media...) decide themselves
  const pagePath = toPagePath(splitPath(p)); // same decoding as the catch-all route
  if (!pagePath && segs.length) return true;
  return !(await db.page.findFirst({ where: { path: pagePath, ...publishedWhere() }, select: { id: true } }));
}

export const NOT_FOUND_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, follow"><title>Page introuvable | BatiNova Construction</title><style>body{margin:0;font-family:Georgia,'Times New Roman',serif;background:#F5F2EC;color:#303030}main{max-width:44rem;margin:0 auto;padding:6rem 1.25rem}p.e{font:600 .78rem system-ui,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#7a6a58}h1{font-size:clamp(2rem,6vw,3.25rem);font-weight:500;margin:1rem 0}p{font:1.125rem/1.6 system-ui,sans-serif}a{display:inline-block;margin:1.5rem 1rem 0 0;padding:.8rem 1.4rem;font:600 1rem system-ui,sans-serif;text-decoration:none;border:1px solid #303030;color:#303030}a.p{background:#303030;color:#fff}a:focus-visible{outline:3px solid #B2A08C;outline-offset:3px}</style></head><body><main><p class="e">Erreur 404</p><h1>Cette page est introuvable.</h1><p>Le lien est peut-être incomplet, ou la page a été déplacée. Reprenez depuis l’accueil ou parlez-nous directement de votre projet.</p><a class="p" href="/">Retour à l’accueil</a><a href="/devis">Demander un devis</a></main></body></html>`;
