/**
 * URL & slug rules (owner: architect-security; FROZEN contract).
 *
 * Page.path:
 *  - "" is the HOME page (served at "/"). There is no "accueil" path.
 *  - otherwise 1..4 lower-case segments joined by "/", each matching SLUG_RE,
 *    no leading/trailing slash: "a-propos", "services/renovation",
 *    "zones-intervention/manche".
 *  - the first segment must not be a RESERVED_SEGMENT (those are code routes).
 * Post.slug / Project.slug / Category.slug / Tag.slug: single SLUG_RE segment.
 *
 * Public URL scheme:
 *   page       /<path>               (home: /)
 *   post       /blog/<slug>
 *   blog index /blog  (?page=N)
 *   category   /blog/categorie/<slug>
 *   tag        /blog/etiquette/<slug>
 *   project    /realisations/<slug>
 *   projects   /realisations
 *   media      /media/<storageKey>
 */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;
export const PAGE_PATH_MAX_SEGMENTS = 4;
export const HOME_PATH = "";

/** First segments owned by code routes — CMS pages may not use them. */
export const RESERVED_SEGMENTS = new Set([
  "admin",
  "api",
  "media",
  "blog",
  "realisations",
  "devis",
  "_next",
  "sitemap.xml",
  "robots.txt",
  "favicon.ico",
  "manifest.webmanifest",
  "opengraph-image",
  "icon",
  "apple-icon",
]);

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= SLUG_MAX && SLUG_RE.test(slug);
}

/** Validates a stored Page.path ("" allowed for home). */
export function isValidPagePath(path: string): boolean {
  if (path === HOME_PATH) return true;
  const segs = path.split("/");
  if (segs.length > PAGE_PATH_MAX_SEGMENTS) return false;
  if (RESERVED_SEGMENTS.has(segs[0] ?? "")) return false;
  return segs.every(isValidSlug);
}

/** Converts route params (`[[...slug]]`) or a URL path to the stored Page.path form. */
export function toPagePath(input: string | readonly string[] | undefined): string {
  const raw = Array.isArray(input) ? input.join("/") : ((input as string | undefined) ?? "");
  return raw
    .split("/")
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .filter(Boolean)
    .join("/")
    .toLowerCase();
}

/** Lower-case ASCII slug from free text (French accents folded). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // strip combining marks (accents)
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

export const pageUrl = (path: string) => (path === HOME_PATH ? "/" : `/${path}`);
export const postUrl = (slug: string) => `/blog/${slug}`;
export const blogIndexUrl = (page = 1) => (page > 1 ? `/blog?page=${page}` : "/blog");
export const categoryUrl = (slug: string) => `/blog/categorie/${slug}`;
export const tagUrl = (slug: string) => `/blog/etiquette/${slug}`;
export const projectUrl = (slug: string) => `/realisations/${slug}`;
export const projectsIndexUrl = () => "/realisations";
export const mediaUrl = (storageKey: string) => `/media/${storageKey.split("/").map(encodeURIComponent).join("/")}`;
