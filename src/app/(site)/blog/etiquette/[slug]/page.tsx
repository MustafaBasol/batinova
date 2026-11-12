// Tag archive (URL scheme from paths.ts: /blog/etiquette/<slug>). noindex,follow: thin taxonomy pages, never in the sitemap.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogListing } from "@/components/views/BlogListing";
import { JsonLd } from "@/components/seo/JsonLd";
import { tagBreadcrumbs } from "@/components/site/breadcrumbs";
import { tagUrl } from "@/lib/content/paths";
import { getTagBySlug, listCategories, listPublishedPosts } from "@/lib/content/public";
import { buildBreadcrumbList, graph } from "@/lib/seo/jsonld";
import { pagedPath, parsePageParam, type RawSearchParams } from "@/lib/seo/listing";
import { notFoundMetadata } from "@/lib/seo/metadata";
import { seoMetadata } from "@/lib/seo/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) return notFoundMetadata("Étiquette introuvable");
  return seoMetadata({ title: `Articles : ${tag.name}`, path: tagUrl(slug), noindex: true });
}

export default async function TagPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) notFound();
  const page = parsePageParam((await searchParams).page);
  const [list, categories] = await Promise.all([listPublishedPosts({ page, tagSlug: slug }), listCategories()]);
  return (
    <>
      <JsonLd data={graph(buildBreadcrumbList(tagBreadcrumbs(tag)))} />
      <BlogListing
        eyebrow="Étiquette"
        title={tag.name}
        crumbs={tagBreadcrumbs(tag)}
        categories={categories.filter((c) => c.postCount > 0)}
        items={list.items}
        page={list.page}
        pageCount={list.pageCount}
        hrefFor={(n) => pagedPath(tagUrl(slug), n)}
      />
    </>
  );
}
