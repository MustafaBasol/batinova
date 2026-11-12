import type { Metadata } from "next";
import { BlogListing } from "@/components/views/BlogListing";
import { blogIndexBreadcrumbs } from "@/components/site/breadcrumbs";
import { blogIndexUrl } from "@/lib/content/paths";
import { listCategories, listPublishedPosts } from "@/lib/content/public";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ page?: string }> };
const pageNum = (v?: string) => Math.max(1, Math.min(500, parseInt(v ?? "1", 10) || 1));

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = pageNum((await searchParams).page);
  return buildMetadata({
    title: page > 1 ? `Blog, page ${page}` : "Blog : conseils pour vos projets de travaux",
    description: "Articles et conseils pour préparer un projet de rénovation, d’extension ou de construction.",
    path: blogIndexUrl(page),
  });
}

export default async function BlogPage({ searchParams }: Props) {
  const page = pageNum((await searchParams).page);
  const [list, categories] = await Promise.all([listPublishedPosts({ page }), listCategories()]);
  return (
    <BlogListing
      title="Le blog"
      intro="Repères, questions à se poser et conseils pour préparer sereinement un projet de rénovation, d’extension ou de construction."
      crumbs={blogIndexBreadcrumbs()}
      categories={categories.filter((c) => c.postCount > 0)}
      items={list.items}
      page={list.page}
      pageCount={list.pageCount}
      hrefFor={blogIndexUrl}
    />
  );
}
