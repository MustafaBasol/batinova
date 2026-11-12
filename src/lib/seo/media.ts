/**
 * Social / structured-data image selection (owner: seo-content). Pure, no I/O.
 * Prefers the smallest WebP variant that is at least 1200 px wide (Google asks for
 * >= 1200 px wide images for Article/Discover; OG crawlers want ~1200x630-ish),
 * falling back to the largest variant, then to the master file.
 */
import { mediaUrl } from "@/lib/content/paths";
import { absoluteUrl } from "@/lib/config/site";
import { OG_DEFAULT } from "@/components/site/brand-assets";

export interface SeoImage {
  /** Absolute URL on the canonical origin. */
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface SeoMediaLike {
  storageKey: string;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  variants?: unknown;
}

interface V {
  key: string;
  width: number;
  height: number;
}

function webpVariants(raw: unknown): V[] {
  if (!Array.isArray(raw)) return [];
  const out: V[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const fmt = typeof r.format === "string" ? r.format : typeof r.mime === "string" ? r.mime.replace("image/", "") : "";
    if (fmt !== "webp") continue;
    if (typeof r.key !== "string" || typeof r.width !== "number") continue;
    out.push({ key: r.key, width: r.width, height: typeof r.height === "number" ? r.height : 0 });
  }
  return out.sort((a, b) => a.width - b.width);
}

export function seoImageFromMedia(m: SeoMediaLike | null | undefined, minWidth = 1200): SeoImage | null {
  if (!m) return null;
  const vs = webpVariants(m.variants);
  const pick = vs.find((v) => v.width >= minWidth) ?? vs[vs.length - 1];
  if (pick) {
    return {
      url: absoluteUrl(mediaUrl(pick.key)),
      width: pick.width,
      height: pick.height || undefined,
      alt: m.alt || undefined,
    };
  }
  return {
    url: absoluteUrl(mediaUrl(m.storageKey)),
    width: m.width ?? undefined,
    height: m.height ?? undefined,
    alt: m.alt || undefined,
  };
}

export const DEFAULT_OG_IMAGE: SeoImage = {
  url: absoluteUrl(OG_DEFAULT.src),
  width: OG_DEFAULT.width,
  height: OG_DEFAULT.height,
  alt: "BatiNova Construction : Construire autrement.",
};
