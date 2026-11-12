/**
 * Global indexing switch (owner: seo-content). Safe for server + client import.
 * Search engines may index the site ONLY when SITE_INDEXING=true is set explicitly
 * (production on https://btnv.fr). Any other value (unset, staging, dev, preview)
 * keeps the whole site out of the index: robots.txt `Disallow: /`, `X-Robots-Tag`
 * header (proxy) and `<meta name="robots" content="noindex">` on every page.
 */
export function isIndexingEnabled(): boolean {
  return process.env.SITE_INDEXING === "true";
}

/** Host that must be used publicly (e.g. "btnv.fr"); empty = do not enforce (localhost, previews). */
export function canonicalHost(): string {
  return (process.env.CANONICAL_HOST ?? "").trim().toLowerCase();
}
