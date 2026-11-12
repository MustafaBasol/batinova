/**
 * Metadata builder (owner: seo-content). `BuildMetadataInput` fields that existed in
 * Phase 1 keep their meaning; everything added later is optional.
 *
 * Guarantees (all rendered server-side in the HTML <head>):
 *  - title: brand suffix stripped (the root layout template adds " | BatiNova Construction");
 *  - description: entity value -> site default (settings.seo) -> generated excerpt;
 *  - canonical: absolute, on SITE_URL, no trailing slash; only same-origin canonicals are honoured;
 *  - og:* / twitter:*: fr_FR, site name, image (entity -> default 1200x630 with size + alt);
 *  - robots: noindex when requested, for placeholder content, or when SITE_INDEXING !== "true".
 */
import type { Metadata } from "next";
import { SITE, SITE_URL, absoluteUrl } from "@/lib/config/site";
import { isIndexingEnabled } from "./indexing";
import { DEFAULT_OG_IMAGE, type SeoImage } from "./media";

export interface BuildMetadataInput {
  title: string;
  description?: string | null;
  /** Site-relative path (or same-origin absolute URL) of the canonical, e.g. "/", "/blog/mon-article", "/blog?page=2". */
  path: string;
  noindex?: boolean;
  /** Absolute URL or site-relative path ("/media/..."), or an image object. Falls back to the default OG image. */
  ogImage?: string | { url: string; width?: number | null; height?: number | null; alt?: string | null } | null;
  type?: "website" | "article";
  publishedTime?: Date | string | null;
  modifiedTime?: Date | string | null;
  /** Placeholder / demo content: kept out of the index until the owner confirms it. */
  isPlaceholder?: boolean;
  /** Site-wide default description (settings.seo.defaultMetaDescription). */
  defaultDescription?: string | null;
  /** Used to generate a description when nothing else is available (plain text, trimmed to ~160 chars). */
  fallbackText?: string | null;
  /** Article only. */
  section?: string | null;
  tags?: string[];
  authors?: string[];
  /** Used when `ogImage` is empty (e.g. settings.seo.defaultOgImageId resolved by the caller). */
  defaultImage?: SeoImage | null;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);

const BRAND_SUFFIX = /\s*[|–—\-:]\s*BatiNova(?:\s+Construction)?\s*$/i;

/** Removes a trailing " | BatiNova Construction" (any dash/pipe variant) so the template never doubles it. */
export function cleanTitle(title: string): string {
  const t = title.trim();
  const stripped = t.replace(BRAND_SUFFIX, "").trim();
  return stripped.length >= 3 ? stripped : t;
}

export function truncateDescription(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-]+$/, "")}…`;
}

/** Normalises a canonical path/URL to a site-relative path without trailing slash ("/" for home). */
export function normalizeCanonicalPath(input: string): string {
  let p = (input || "/").trim();
  if (/^https?:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      if (u.origin !== SITE_URL) return "/"; // never emit a foreign canonical from CMS data
      p = `${u.pathname}${u.search}`;
    } catch {
      return "/";
    }
  }
  if (!p.startsWith("/")) p = `/${p}`;
  const [pathname = "/", ...q] = p.split("?");
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const query = q.join("?");
  return query ? `${clean || "/"}?${query}` : clean || "/";
}

function resolveImage(input: BuildMetadataInput): SeoImage {
  const img = input.ogImage;
  if (img) {
    const o = typeof img === "string" ? { url: img } : img;
    return {
      url: o.url.startsWith("http") ? o.url : absoluteUrl(o.url),
      width: ("width" in o ? o.width : undefined) ?? undefined,
      height: ("height" in o ? o.height : undefined) ?? undefined,
      alt: ("alt" in o ? o.alt : undefined) || undefined,
    };
  }
  return input.defaultImage ?? DEFAULT_OG_IMAGE;
}

export function buildMetadata(input: BuildMetadataInput): Metadata {
  const canonicalPath = normalizeCanonicalPath(input.path || "/");
  const canonical = absoluteUrl(canonicalPath);
  const title = cleanTitle(input.title);
  const description =
    input.description?.trim() ||
    input.defaultDescription?.trim() ||
    (input.fallbackText?.trim() ? truncateDescription(input.fallbackText) : undefined) ||
    undefined;
  const image = resolveImage(input);
  const images = [{ url: image.url, width: image.width, height: image.height, alt: image.alt || title }];

  const index = isIndexingEnabled() && !input.noindex && !input.isPlaceholder;
  const robots: Metadata["robots"] = index
    ? { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } }
    : { index: false, follow: true, googleBot: { index: false, follow: true } };

  const common = { url: canonical, siteName: SITE.name, locale: SITE.ogLocale, title, description, images };
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: { canonical },
    robots,
    openGraph:
      input.type === "article"
        ? {
            ...common,
            type: "article",
            publishedTime: iso(input.publishedTime),
            modifiedTime: iso(input.modifiedTime),
            section: input.section || undefined,
            tags: input.tags?.length ? input.tags : undefined,
            authors: input.authors?.length ? input.authors : undefined,
          }
        : { ...common, type: "website" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

/** Metadata for 404 / missing entities: no index, no canonical, never cached as content. */
export function notFoundMetadata(title = "Page introuvable"): Metadata {
  return { title, robots: { index: false, follow: false } };
}
