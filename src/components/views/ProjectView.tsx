/**
 * Presentational project detail (public route + admin preview). STABLE CONTRACT.
 * <ProjectView project media />
 *   project : { slug, title, summary?, region?, locationLabel?, isPlaceholder?, coverImage?, blocks?,
 *               media: Array<{ role: "GALLERY"|"BEFORE"|"AFTER"; media: MediaLike }> }
 *   media   : Record<mediaId, MediaLike> for blocks
 * Shows gallery + an accessible before/after slider when both a BEFORE and an AFTER image exist.
 * Only real, owner-published projects are ever shown here; placeholders carry the « Contenu de démonstration » badge.
 */
import Link from "next/link";
import type { CmsBlock } from "@/lib/blocks/schema";
import { BlockRenderer } from "@/components/blocks/BlockRenderer";
import { BeforeAfter } from "@/components/media/BeforeAfter";
import { MediaFrame, PlaceholderBadge, type MediaLike } from "@/components/media/ResponsiveImage";
import { Breadcrumbs } from "@/components/site/BreadcrumbNav";
import { projectBreadcrumbs } from "@/components/site/breadcrumbs";
import { REGION_LABELS } from "@/lib/config/site";
import type { ProjectCardData } from "./Cards";

export interface ProjectViewData extends ProjectCardData {
  blocks?: CmsBlock[];
  media: { role: "GALLERY" | "BEFORE" | "AFTER" | string; media: MediaLike }[];
}

export function ProjectView({ project, media }: { project: ProjectViewData; media: Record<string, MediaLike> }) {
  const region = project.region ? REGION_LABELS[project.region as keyof typeof REGION_LABELS] : null;
  const before = project.media.find((m) => m.role === "BEFORE")?.media;
  const after = project.media.find((m) => m.role === "AFTER")?.media;
  const gallery = project.media.filter((m) => m.role === "GALLERY").map((m) => m.media);
  const hero = project.coverImage ?? gallery[0];
  return (
    <article>
      <div className="wrap pt-6">
        <Breadcrumbs items={projectBreadcrumbs(project)} />
      </div>
      <header className="wrap pb-10 pt-10 sm:pt-14 lg:pt-20">
        <p className="eyebrow rise">{[project.locationLabel, region].filter(Boolean).join(" · ") || "Réalisation"}</p>
        <h1 className="display h-page rise rise-2 mt-5 max-w-4xl">{project.title}</h1>
        {project.summary && <p className="lead rise rise-3 mt-6">{project.summary}</p>}
        {project.isPlaceholder && (
          <p className="mt-6">
            <PlaceholderBadge inline />
          </p>
        )}
      </header>
      {hero && (
        <div className="wrap">
          <MediaFrame media={hero} ratio="16 / 9" priority sizes="(min-width: 1700px) 1536px, 100vw" frameClassName="!aspect-[4/3] sm:!aspect-[16/9]" />
        </div>
      )}
      {before && after && (
        <section className="wrap section-tight" aria-labelledby="avant-apres">
          <h2 id="avant-apres" className="display h-section mb-8">
            Avant / après
          </h2>
          <BeforeAfter before={before} after={after} />
        </section>
      )}
      {gallery.length > 0 && (
        <section className="wrap section-tight" aria-labelledby="galerie">
          <h2 id="galerie" className="display h-section mb-8">
            Galerie
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
            {gallery.map((m, i) => (
              <li key={m.storageKey + i}>
                <figure>
                  <MediaFrame media={m} ratio="4 / 3" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" />
                  {m.caption && <figcaption className="mt-2 text-sm text-bronze">{m.caption}</figcaption>}
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}
      {project.blocks && project.blocks.length > 0 && <BlockRenderer blocks={project.blocks} media={media} h1={false} />}
      <section className="on-dark bg-charcoal text-offwhite">
        <div className="wrap section grid gap-8 lg:grid-cols-12 lg:items-end">
          <h2 className="display h-section max-w-3xl lg:col-span-8">Un projet comparable ?</h2>
          <div className="lg:col-span-4 lg:text-right">
            <Link href="/devis" className="btn btn-beige w-full sm:w-auto">
              Demander un devis
            </Link>
          </div>
        </div>
      </section>
    </article>
  );
}
