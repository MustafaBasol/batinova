import "server-only";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPageByPath, getSettings, type PublicPage } from "@/lib/content/public";
import { pageUrl, toPagePath } from "@/lib/content/paths";
import { richTextToPlainText } from "@/lib/richtext/schema";
import { pageBreadcrumbs } from "@/components/site/breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbList, buildOrganization, buildService, buildWebSite, graph } from "@/lib/seo/jsonld";
import { notFoundMetadata } from "@/lib/seo/metadata";
import { ogFromMedia, seoMetadata } from "@/lib/seo/server";
import { PageView } from "./PageView";
import { loadMediaMap } from "./media-map";

/** First usable sentence(s) of a page, used only when the editor left the meta description empty. */
function pageFallbackText(page: PublicPage): string {
  for (const b of page.blocks) {
    if (b.type === "hero" && b.subheading) return b.subheading;
    if (b.type === "richText") {
      const t = richTextToPlainText(b.doc).replace(/\n+/g, " ");
      if (t) return t;
    }
  }
  return "";
}

/** Shared by `/` and the catch-all route: metadata from the page's SEO fields. */
export async function pageMetadata(path: string): Promise<Metadata> {
  const page = await getPublishedPageByPath(path);
  if (!page) return notFoundMetadata();
  return seoMetadata({
    title: page.metaTitle || page.title,
    description: page.metaDescription,
    fallbackText: pageFallbackText(page),
    path: page.canonicalPath || pageUrl(page.path),
    noindex: page.noindex,
    isPlaceholder: page.isPlaceholder,
    ogImage: ogFromMedia(page.ogImage),
  });
}

export async function renderPage(rawPath: string | string[] | undefined) {
  const path = toPagePath(rawPath);
  const page: PublicPage | null = await getPublishedPageByPath(path);
  if (!page) notFound();
  const [media, settings] = await Promise.all([loadMediaMap(page.blocks), getSettings()]);

  const isHome = page.path === "";
  const ld = isHome
    ? graph(buildOrganization(settings), buildWebSite())
    : graph(
        buildBreadcrumbList(pageBreadcrumbs(page)),
        page.template === "SERVICE"
          ? buildService(
              { name: page.title, description: page.metaDescription || pageFallbackText(page), path: pageUrl(page.path), isPlaceholder: page.isPlaceholder },
              settings,
            )
          : null,
      );
  return (
    <>
      <JsonLd data={ld} />
      <PageView page={page} media={media} />
    </>
  );
}
