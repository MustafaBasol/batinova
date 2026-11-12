import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostView } from "@/components/views/PostView";
import { loadMediaMap } from "@/components/views/media-map";
import { JsonLd } from "@/components/seo/JsonLd";
import { postBreadcrumbs } from "@/components/site/breadcrumbs";
import { postUrl } from "@/lib/content/paths";
import { getPublishedPostBySlug, listPublishedPosts } from "@/lib/content/public";
import { countWords, richTextToPlainText } from "@/lib/richtext/schema";
import { buildArticle, buildBreadcrumbList, graph } from "@/lib/seo/jsonld";
import { normalizeCanonicalPath, notFoundMetadata } from "@/lib/seo/metadata";
import { ogFromMedia, seoMetadata } from "@/lib/seo/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return notFoundMetadata("Article introuvable");
  return seoMetadata({
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt,
    fallbackText: richTextToPlainText(post.body).replace(/\n+/g, " "),
    path: post.canonicalPath || postUrl(slug),
    noindex: post.noindex,
    type: "article",
    publishedTime: post.publishedAt ?? post.scheduledAt,
    modifiedTime: post.updatedAt,
    section: post.category?.name,
    tags: post.tags.map((t) => t.name),
    authors: post.authorDisplayName ? [post.authorDisplayName] : undefined,
    ogImage: ogFromMedia(post.ogImage ?? post.coverImage),
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();
  const [media, relatedList] = await Promise.all([
    loadMediaMap(post.blocks, [post.body]),
    // Related = same category first; topped up with the latest posts below.
    listPublishedPosts({ perPage: 4, categorySlug: post.category?.slug }),
  ]);
  let related = relatedList.items.filter((p) => p.slug !== slug).slice(0, 3);
  if (related.length < 3) {
    const latest = await listPublishedPosts({ perPage: 6 });
    const have = new Set([slug, ...related.map((p) => p.slug)]);
    related = [...related, ...latest.items.filter((p) => !have.has(p.slug))].slice(0, 3);
  }
  const image = ogFromMedia(post.ogImage ?? post.coverImage);
  const ld = graph(
    buildBreadcrumbList(postBreadcrumbs(post)),
    buildArticle({
      title: post.title,
      description: post.metaDescription || post.excerpt,
      path: normalizeCanonicalPath(post.canonicalPath || postUrl(slug)),
      imageUrl: image?.url,
      publishedAt: post.publishedAt ?? post.scheduledAt,
      modifiedAt: post.updatedAt,
      authorDisplayName: post.authorDisplayName,
      section: post.category?.name,
      keywords: post.tags.map((t) => t.name),
      wordCount: countWords(richTextToPlainText(post.body)),
    }),
  );
  return (
    <>
      <JsonLd data={ld} />
      <PostView post={post} media={media} related={related} />
    </>
  );
}
