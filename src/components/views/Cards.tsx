/**
 * Shared cards (server-safe): <PostCard post featured? /> <ProjectCard project /> <ProjectsEmptyState />
 * Inputs are the PublicPostListItem / PublicProjectListItem shapes of src/lib/content/public.ts.
 */
import Link from "next/link";
import { MediaFrame, PlaceholderBadge, type MediaLike } from "@/components/media/ResponsiveImage";
import { postUrl, projectUrl } from "@/lib/content/paths";
import { REGION_LABELS } from "@/lib/config/site";
import { formatDateFr, isoDate } from "./format";

export interface PostCardData {
  slug: string;
  title: string;
  excerpt?: string | null;
  publishedAt?: Date | string | null;
  scheduledAt?: Date | string | null;
  readingMinutes?: number | null;
  isPlaceholder?: boolean;
  coverImage?: MediaLike | null;
  category?: { slug: string; name: string } | null;
}

export function PostCard({ post, featured = false }: { post: PostCardData; featured?: boolean }) {
  const date = post.publishedAt ?? post.scheduledAt;
  return (
    <article className={`zoom-host group ${featured ? "lg:col-span-2" : ""}`}>
      <Link href={postUrl(post.slug)} className="block no-underline">
        {post.coverImage ? (
          <MediaFrame
            media={post.coverImage}
            ratio={featured ? "16 / 9" : "4 / 3"}
            sizes={featured ? "(min-width: 1024px) 66vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"}
            zoom
          />
        ) : (
          <div className="frame" style={{ aspectRatio: featured ? "16 / 9" : "4 / 3" }} aria-hidden="true" />
        )}
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-bronze">
          {post.category && <span className="eyebrow">{post.category.name}</span>}
          {date && <time dateTime={isoDate(date)}>{formatDateFr(date)}</time>}
          {post.readingMinutes ? <span>{post.readingMinutes} min de lecture</span> : null}
        </div>
        <h3 className={`display mt-2 ${featured ? "h-section" : "h-card"} group-hover:underline decoration-beige decoration-1 underline-offset-[0.2em]`}>
          {post.title}
        </h3>
        {post.excerpt && <p className="mt-3 max-w-2xl text-charcoal/80">{post.excerpt}</p>}
      </Link>
      {post.isPlaceholder && (
        <p className="mt-3">
          <PlaceholderBadge inline />
        </p>
      )}
    </article>
  );
}

export interface ProjectCardData {
  slug: string;
  title: string;
  summary?: string | null;
  region?: string | null;
  locationLabel?: string | null;
  isPlaceholder?: boolean;
  coverImage?: MediaLike | null;
}

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const region = project.region ? REGION_LABELS[project.region as keyof typeof REGION_LABELS] : null;
  return (
    <article className="zoom-host group">
      <Link href={projectUrl(project.slug)} className="block no-underline">
        {project.coverImage ? (
          <MediaFrame media={project.coverImage} ratio="4 / 3" sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" zoom />
        ) : (
          <div className="frame" style={{ aspectRatio: "4 / 3" }} aria-hidden="true" />
        )}
        <p className="eyebrow mt-5">{[project.locationLabel, region].filter(Boolean).join(" · ") || "Réalisation"}</p>
        <h3 className="display h-card mt-2 group-hover:underline decoration-beige decoration-1 underline-offset-[0.2em]">{project.title}</h3>
        {project.summary && <p className="mt-3 text-charcoal/80">{project.summary}</p>}
      </Link>
      {project.isPlaceholder && (
        <p className="mt-3">
          <PlaceholderBadge inline />
        </p>
      )}
    </article>
  );
}

/** Honest empty state: no completed project is shown until the owner publishes real ones. */
export function ProjectsEmptyState({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const H = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="grid gap-10 border border-charcoal/20 bg-white p-8 sm:p-12 lg:grid-cols-12">
      <div className="lg:col-span-7">
        <p className="eyebrow">Portfolio en préparation</p>
        <H className="display h-section mt-4">Nos premières réalisations seront présentées ici prochainement.</H>
        <p className="lead mt-5">
          Nous ne publions que des chantiers réels, documentés avec l’accord de leurs propriétaires. En attendant, découvrez notre façon de conduire un projet, du premier échange à la remise des clés.
        </p>
      </div>
      <div className="flex flex-col justify-end gap-4 lg:col-span-5 lg:items-end">
        <Link href="/notre-methode" className="btn btn-primary w-full sm:w-auto">
          Découvrir notre méthode
        </Link>
        <Link href="/devis" className="btn btn-outline w-full sm:w-auto">
          Parler de votre projet
        </Link>
      </div>
    </div>
  );
}
