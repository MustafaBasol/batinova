import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPageByPath, type PublicPage } from "@/lib/content/public";
import { mediaUrl, pageUrl, toPagePath } from "@/lib/content/paths";
import { buildMetadata } from "@/lib/seo/metadata";
import { PageView } from "./PageView";
import { loadMediaMap } from "./media-map";

/** Shared by `/` and the catch-all route: metadata from the page's SEO fields. */
export async function pageMetadata(path: string): Promise<Metadata> {
  const page = await getPublishedPageByPath(path);
  if (!page) return { title: "Page introuvable", robots: { index: false, follow: true } };
  return buildMetadata({
    title: page.metaTitle || page.title,
    description: page.metaDescription,
    path: page.canonicalPath || pageUrl(page.path),
    noindex: page.noindex,
    ogImage: page.ogImage ? { url: mediaUrl(page.ogImage.storageKey), width: page.ogImage.width, height: page.ogImage.height, alt: page.ogImage.alt } : null,
  });
}

export async function renderPage(rawPath: string | string[] | undefined) {
  const path = toPagePath(rawPath);
  const page: PublicPage | null = await getPublishedPageByPath(path);
  if (!page) notFound();
  const media = await loadMediaMap(page.blocks);
  return <PageView page={page} media={media} />;
}
