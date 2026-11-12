import type { Metadata } from "next";
import { BlogListing } from "@/components/views/BlogListing";
import { JsonLd } from "@/components/seo/JsonLd";
import { blogIndexBreadcrumbs } from "@/components/site/breadcrumbs";
import { blogIndexUrl } from "@/lib/content/paths";
import { listCategories, listPublishedPosts } from "@/lib/content/public";
import { buildBreadcrumbList, graph } from "@/lib/seo/jsonld";
import { hasExtraParams, pageTitleSuffix, pagedPath, parsePageParam, type RawSearchParams } from "@/lib/seo/listing";
import { seoMetadata } from "@/lib/seo/server";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const page = parsePageParam(sp.page);
  const list = await listPublishedPosts({ page });
  return seoMetadata({
    title: pageTitleSuffix("Blog : conseils pour vos projets de travaux", page),
    description: "Articles et conseils pour préparer un projet de rénovation, d’extension ou de construction.",
    path: hasExtraParams(sp) ? blogIndexUrl() : pagedPath(blogIndexUrl(), page),
    // Empty blog, out-of-range page or filtered/searched variants stay out of the index.
    noindex: hasExtraParams(sp) || list.items.length === 0,
  });
}

export default async function BlogPage({ searchParams }: Props) {
  const page = parsePageParam((await searchParams).page);
  const [list, categories] = await Promise.all([listPublishedPosts({ page }), listCategories()]);
  return (
    <>
      <JsonLd data={graph(buildBreadcrumbList(blogIndexBreadcrumbs()))} />
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
    </>
  );
}
