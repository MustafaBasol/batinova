import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogListing } from "@/components/views/BlogListing";
import { JsonLd } from "@/components/seo/JsonLd";
import { categoryBreadcrumbs } from "@/components/site/breadcrumbs";
import { categoryUrl } from "@/lib/content/paths";
import { getCategoryBySlug, listCategories, listPublishedPosts } from "@/lib/content/public";
import { buildBreadcrumbList, graph } from "@/lib/seo/jsonld";
import { hasExtraParams, pageTitleSuffix, pagedPath, parsePageParam, type RawSearchParams } from "@/lib/seo/listing";
import { notFoundMetadata } from "@/lib/seo/metadata";
import { ogFromMedia, seoMetadata } from "@/lib/seo/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) return notFoundMetadata("Catégorie introuvable");
  const sp = await searchParams;
  const page = parsePageParam(sp.page);
  const list = await listPublishedPosts({ page, categorySlug: slug });
  const clean = hasExtraParams(sp);
  return seoMetadata({
    title: pageTitleSuffix(cat.metaTitle || `${cat.name} : articles du blog`, page),
    description: cat.metaDescription || cat.description,
    path: cat.canonicalPath || (clean ? categoryUrl(slug) : pagedPath(categoryUrl(slug), page)),
    // Empty categories, out-of-range pages and filtered variants are not indexable.
    noindex: cat.noindex || clean || list.items.length === 0,
    ogImage: ogFromMedia(cat.ogImage),
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();
  const page = parsePageParam((await searchParams).page);
  const [list, categories] = await Promise.all([listPublishedPosts({ page, categorySlug: slug }), listCategories()]);
  return (
    <>
      <JsonLd data={graph(buildBreadcrumbList(categoryBreadcrumbs(cat)))} />
      <BlogListing
        eyebrow="Catégorie"
        title={cat.name}
        intro={cat.description}
        crumbs={categoryBreadcrumbs(cat)}
        categories={categories.filter((c) => c.postCount > 0)}
        activeCategory={slug}
        items={list.items}
        page={list.page}
        pageCount={list.pageCount}
        hrefFor={(n) => pagedPath(categoryUrl(slug), n)}
      />
    </>
  );
}
