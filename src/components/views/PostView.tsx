/**
 * Presentational blog article (public route + admin preview). STABLE CONTRACT.
 * <PostView post media related? />
 *   post    : { slug, title, excerpt?, body (Tiptap doc), blocks?, publishedAt?, scheduledAt?, updatedAt?, readingMinutes?,
 *               authorDisplayName?, isPlaceholder?, coverImage?: MediaLike|null, category?, tags? }
 *   media   : Record<mediaId, MediaLike> for body/blocks images
 *   related : PostCardData[] (optional)
 * H1 = title. Includes breadcrumbs, cover, meta (fr-FR dates, Europe/Paris), body, tags, related posts, quote CTA.
 */
import Link from "next/link";
import type { CmsBlock } from "@/lib/blocks/schema";
import { BlockRenderer } from "@/components/blocks/BlockRenderer";
import { MediaFrame, PlaceholderBadge, type MediaLike } from "@/components/media/ResponsiveImage";
import { RichText } from "@/components/richtext/RichText";
import { Breadcrumbs } from "@/components/site/BreadcrumbNav";
import { postBreadcrumbs } from "@/components/site/breadcrumbs";
import { categoryUrl, tagUrl } from "@/lib/content/paths";
import { PostCard, type PostCardData } from "./Cards";
import { formatDateFr, isoDate } from "./format";

export interface PostViewData extends PostCardData {
  body: unknown;
  blocks?: CmsBlock[];
  updatedAt?: Date | string | null;
  authorDisplayName?: string | null;
  tags?: { slug: string; name: string }[];
}

export function PostView({ post, media, related = [] }: { post: PostViewData; media: Record<string, MediaLike>; related?: PostCardData[] }) {
  const date = post.publishedAt ?? post.scheduledAt;
  return (
    <article>
      <div className="wrap pt-6">
        <Breadcrumbs items={postBreadcrumbs(post)} />
      </div>
      <header className="wrap pb-10 pt-10 sm:pt-14 lg:pt-20">
        <div className="mx-auto max-w-4xl">
          {post.category && (
            <p className="eyebrow rise">
              <Link href={categoryUrl(post.category.slug)} className="link-line">
                {post.category.name}
              </Link>
            </p>
          )}
          <h1 className="display h-page rise rise-2 mt-5">{post.title}</h1>
          {post.excerpt && <p className="lead rise rise-3 mt-6">{post.excerpt}</p>}
          <p className="rise rise-3 mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-bronze">
            {date && <time dateTime={isoDate(date)}>{formatDateFr(date)}</time>}
            {post.readingMinutes ? <span>{post.readingMinutes} min de lecture</span> : null}
            {post.authorDisplayName ? <span>{post.authorDisplayName}</span> : null}
            {post.isPlaceholder && <PlaceholderBadge inline />}
          </p>
        </div>
      </header>
      {post.coverImage && (
        <div className="wrap">
          <MediaFrame media={post.coverImage} ratio="16 / 9" priority sizes="(min-width: 1700px) 1536px, 100vw" frameClassName="!aspect-[4/3] sm:!aspect-[16/9]" />
        </div>
      )}
      <div className="wrap section-tight">
        <div className="mx-auto max-w-[44rem]">
          <RichText doc={post.body} media={media} />
          {post.tags && post.tags.length > 0 && (
            <ul className="mt-12 flex flex-wrap gap-2" aria-label="Étiquettes">
              {post.tags.map((t) => (
                <li key={t.slug}>
                  <Link href={tagUrl(t.slug)} className="inline-block border border-charcoal/30 px-3 py-1.5 text-sm hover:bg-charcoal hover:text-offwhite">
                    {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {post.blocks && post.blocks.length > 0 && <BlockRenderer blocks={post.blocks} media={media} h1={false} />}
      {related.length > 0 && (
        <section className="wrap section" aria-labelledby="lire-aussi">
          <h2 id="lire-aussi" className="display h-section mb-10">
            À lire aussi
          </h2>
          <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      )}
      <section className="on-dark bg-charcoal text-offwhite">
        <div className="wrap section grid gap-8 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-8">
            <h2 className="display h-section max-w-3xl">Un projet de travaux en tête ?</h2>
            <p className="lead mt-5">Décrivez-le-nous en quelques étapes. Nous reviendrons vers vous pour en discuter.</p>
          </div>
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
