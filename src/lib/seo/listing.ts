/**
 * Listing-page SEO rules (owner: seo-content).
 *  - `?page=N` (N >= 2): self-canonical and indexable (real, distinct content) as long as the page exists;
 *  - any other query parameter (search, filters, tracking...) => noindex and canonical to the clean URL;
 *  - page 1 canonical never carries `?page=1`.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export function parsePageParam(v: string | string[] | undefined): number {
  const raw = Array.isArray(v) ? v[0] : v;
  return Math.max(1, Math.min(500, parseInt(raw ?? "1", 10) || 1));
}

/** True when the query string contains anything besides a plain `page` parameter. */
export function hasExtraParams(sp: RawSearchParams): boolean {
  return Object.keys(sp).some((k) => k !== "page");
}

/** `/blog` or `/blog?page=3`. */
export function pagedPath(base: string, page: number): string {
  return page > 1 ? `${base}?page=${page}` : base;
}

export function pageTitleSuffix(title: string, page: number): string {
  return page > 1 ? `${title}, page ${page}` : title;
}
