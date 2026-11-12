import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogListing } from "@/components/views/BlogListing";
import { categoryBreadcrumbs } from "@/components/site/breadcrumbs";
import { categoryUrl, mediaUrl } from "@/lib/content/paths";
import { getCategoryBySlug, listCategories, listPublishedPosts } from "@/lib/content/public";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };
const pageNum = (v?: string) => Math.max(1, Math.min(500, parseInt(v ?? "1", 10) || 1));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) return { title: "Catégorie introuvable", robots: { index: false, follow: true } };
  const page = pageNum((await searchParams).page);
  return buildMetadata({
    title: cat.metaTitle || `${cat.name} : articles du blog`,
    description: cat.metaDescription || cat.description,
    path: cat.canonicalPath || (page > 1 ? `${categoryUrl(slug)}?page=${page}` : categoryUrl(slug)),
    noindex: cat.noindex,
    ogImage: cat.ogImage ? { url: mediaUrl(cat.ogImage.storageKey), width: cat.ogImage.width, height: cat.ogImage.height, alt: cat.ogImage.alt } : null,
  });
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();
  const page = pageNum((await searchParams).page);
  const [list, categories] = await Promise.all([listPublishedPosts({ page, categorySlug: slug }), listCategories()]);
  return (
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
      hrefFor={(n) => (n > 1 ? `${categoryUrl(slug)}?page=${n}` : categoryUrl(slug))}
    />
  );
}
