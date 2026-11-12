/**
 * Metadata builder — STUB (created by architect-security; OWNED by seo-content
 * from Phase 4). Keep the `buildMetadata` signature stable; extend internally.
 */
import type { Metadata } from "next";
import { SITE, SITE_URL, absoluteUrl } from "@/lib/config/site";

export interface BuildMetadataInput {
  title: string;
  description?: string | null;
  /** Site-relative path of the canonical URL, e.g. "/", "/blog/mon-article". */
  path: string;
  noindex?: boolean;
  /** Absolute URL or site-relative path ("/media/..."). */
  ogImage?: string | { url: string; width?: number | null; height?: number | null; alt?: string | null } | null;
  type?: "website" | "article";
  publishedTime?: Date | string | null;
  modifiedTime?: Date | string | null;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);

export function buildMetadata(input: BuildMetadataInput): Metadata {
  const canonical = absoluteUrl(input.path || "/");
  const description = input.description?.trim() || undefined;
  const img = typeof input.ogImage === "string" ? { url: input.ogImage } : (input.ogImage ?? null);
  const images = img
    ? [
        {
          url: img.url.startsWith("http") ? img.url : absoluteUrl(img.url),
          width: img.width ?? undefined,
          height: img.height ?? undefined,
          alt: img.alt ?? undefined,
        },
      ]
    : undefined;
  const robots = input.noindex ? { index: false, follow: true } : { index: true, follow: true };

  const base: Metadata = {
    metadataBase: new URL(SITE_URL),
    title: input.title,
    description,
    alternates: { canonical },
    robots,
    twitter: { card: images ? "summary_large_image" : "summary", title: input.title, description },
  };

  if (input.type === "article") {
    return {
      ...base,
      openGraph: {
        type: "article",
        url: canonical,
        siteName: SITE.name,
        locale: SITE.ogLocale,
        title: input.title,
        description,
        images,
        publishedTime: iso(input.publishedTime),
        modifiedTime: iso(input.modifiedTime),
      },
    };
  }
  return {
    ...base,
    openGraph: {
      type: "website",
      url: canonical,
      siteName: SITE.name,
      locale: SITE.ogLocale,
      title: input.title,
      description,
      images,
    },
  };
}
