import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectView } from "@/components/views/ProjectView";
import { loadMediaMap } from "@/components/views/media-map";
import { mediaUrl, projectUrl } from "@/lib/content/paths";
import { getPublishedProjectBySlug } from "@/lib/content/public";
import { buildMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublishedProjectBySlug(slug);
  if (!p) return { title: "Réalisation introuvable", robots: { index: false, follow: true } };
  const og = p.ogImage ?? p.coverImage;
  return buildMetadata({
    title: p.metaTitle || p.title,
    description: p.metaDescription || p.summary,
    path: p.canonicalPath || projectUrl(slug),
    // Placeholder/demo projects must never be indexed as real work.
    noindex: p.noindex || p.isPlaceholder,
    ogImage: og ? { url: mediaUrl(og.storageKey), width: og.width, height: og.height, alt: og.alt } : null,
  });
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const p = await getPublishedProjectBySlug(slug);
  if (!p) notFound();
  const media = await loadMediaMap(p.blocks);
  return <ProjectView project={p} media={media} />;
}
