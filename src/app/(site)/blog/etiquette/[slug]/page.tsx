// Tag archive (URL scheme from paths.ts: /blog/etiquette/<slug>). noindex,follow: thin taxonomy pages.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogListing } from "@/components/views/BlogListing";
import { tagBreadcrumbs } from "@/components/site/breadcrumbs";
import { tagUrl } from "@/lib/content/paths";
import { getTagBySlug, listCategories, listPublishedPosts } from "@/lib/content/public";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };
const pageNum = (v?: string) => Math.max(1, Math.min(500, parseInt(v ?? "1", 10) || 1));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) return { title: "Étiquette introuvable", robots: { index: false, follow: true } };
  return buildMetadata({ title: `Articles : ${tag.name}`, path: tagUrl(slug), noindex: true });
}

export default async function TagPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const tag = await getTagBySlug(slug);
  if (!tag) notFound();
  const page = pageNum((await searchParams).page);
  const [list, categories] = await Promise.all([listPublishedPosts({ page, tagSlug: slug }), listCategories()]);
  return (
    <BlogListing
      eyebrow="Étiquette"
      title={tag.name}
      crumbs={tagBreadcrumbs(tag)}
      categories={categories.filter((c) => c.postCount > 0)}
      items={list.items}
      page={list.page}
      pageCount={list.pageCount}
      hrefFor={(n) => (n > 1 ? `${tagUrl(slug)}?page=${n}` : tagUrl(slug))}
    />
  );
}
