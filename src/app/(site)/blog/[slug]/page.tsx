import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostView } from "@/components/views/PostView";
import { loadMediaMap } from "@/components/views/media-map";
import { mediaUrl, postUrl } from "@/lib/content/paths";
import { getPublishedPostBySlug, listPublishedPosts } from "@/lib/content/public";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return { title: "Article introuvable", robots: { index: false, follow: true } };
  const og = post.ogImage ?? post.coverImage;
  return buildMetadata({
    title: post.metaTitle || post.title,
    description: post.metaDescription || post.excerpt,
    path: post.canonicalPath || postUrl(slug),
    noindex: post.noindex,
    type: "article",
    publishedTime: post.publishedAt ?? post.scheduledAt,
    modifiedTime: post.updatedAt,
    ogImage: og ? { url: mediaUrl(og.storageKey), width: og.width, height: og.height, alt: og.alt } : null,
  });
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();
  const [media, relatedList] = await Promise.all([
    loadMediaMap(post.blocks, [post.body]),
    listPublishedPosts({ perPage: 4, categorySlug: post.category?.slug }),
  ]);
  const related = relatedList.items.filter((p) => p.slug !== slug).slice(0, 3);
  return <PostView post={post} media={media} related={related} />;
}
