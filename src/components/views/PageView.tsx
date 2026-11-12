/**
 * Presentational page view (public routes + admin preview). STABLE CONTRACT.
 * <PageView page media />
 *   page  : { path, title, template?, blocks: CmsBlock[], isPlaceholder?, parent?: {path,title}|null }
 *   media : Record<mediaId, MediaLike>
 * Renders breadcrumbs (non-home), exactly one <h1> (first hero block, else the page title), the blocks,
 * and a « Contenu de démonstration » notice when isPlaceholder and no placeholderNotice block exists.
 */
import type { CmsBlock } from "@/lib/blocks/schema";
import { BlockRenderer } from "@/components/blocks/BlockRenderer";
import { PlaceholderBadge, type MediaLike } from "@/components/media/ResponsiveImage";
import { Breadcrumbs } from "@/components/site/BreadcrumbNav";
import { pageBreadcrumbs } from "@/components/site/breadcrumbs";

export interface PageViewData {
  path: string;
  title: string;
  template?: string;
  blocks: CmsBlock[];
  isPlaceholder?: boolean;
  parent?: { path: string; title: string } | null;
}

export function PageView({ page, media }: { page: PageViewData; media: Record<string, MediaLike> }) {
  const isHome = page.path === "";
  const firstIsHero = page.blocks[0]?.type === "hero";
  const hasNotice = page.blocks.some((b) => b.type === "placeholderNotice");
  const crumbs = pageBreadcrumbs(page);
  return (
    <article>
      {!isHome && (
        <div className="wrap pt-6">
          <Breadcrumbs items={crumbs} />
        </div>
      )}
      {!firstIsHero && (
        <header className="wrap pb-4 pt-10 sm:pt-14 lg:pt-20">
          <h1 className="display h-page rise max-w-4xl">{page.title}</h1>
        </header>
      )}
      {page.isPlaceholder && !hasNotice && (
        <aside className="wrap pt-4" aria-label="Contenu de démonstration">
          <p className="flex flex-wrap items-center gap-3 border border-stone bg-sand px-4 py-3 text-sm">
            <PlaceholderBadge inline />
            <span>Ce contenu est provisoire et sera confirmé avant publication définitive.</span>
          </p>
        </aside>
      )}
      <BlockRenderer blocks={page.blocks} media={media} h1 heroFull={isHome || page.template === "HOME"} />
    </article>
  );
}
