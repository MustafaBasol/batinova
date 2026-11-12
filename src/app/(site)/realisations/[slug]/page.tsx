import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectView } from "@/components/views/ProjectView";
import { loadMediaMap } from "@/components/views/media-map";
import { JsonLd } from "@/components/seo/JsonLd";
import { projectBreadcrumbs } from "@/components/site/breadcrumbs";
import { projectUrl } from "@/lib/content/paths";
import { getPublishedProjectBySlug } from "@/lib/content/public";
import { buildBreadcrumbList, graph } from "@/lib/seo/jsonld";
import { notFoundMetadata } from "@/lib/seo/metadata";
import { ogFromMedia, seoMetadata } from "@/lib/seo/server";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getPublishedProjectBySlug(slug);
  if (!p) return notFoundMetadata("Réalisation introuvable");
  return seoMetadata({
    title: p.metaTitle || p.title,
    description: p.metaDescription || p.summary,
    path: p.canonicalPath || projectUrl(slug),
    // Placeholder/demo projects must never be indexed as real work.
    noindex: p.noindex,
    isPlaceholder: p.isPlaceholder,
    ogImage: ogFromMedia(p.ogImage ?? p.coverImage),
  });
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const p = await getPublishedProjectBySlug(slug);
  if (!p) notFound();
  const media = await loadMediaMap(p.blocks);
  return (
    <>
      <JsonLd data={graph(buildBreadcrumbList(projectBreadcrumbs(p)))} />
      <ProjectView project={p} media={media} />
    </>
  );
}
