/**
 * CMS block renderer (design-frontend). STABLE CONTRACT — used by public routes and the admin preview.
 *
 * <BlockRenderer blocks media h1? heroFull? />
 *   blocks   : CmsBlock[] (already parsed with parseBlocks)
 *   media    : Record<mediaId, MediaLike> — preload with collectMediaIds(blocks) + getMediaByIds
 *   h1       : default true. When true, a `hero` that is the FIRST block renders the page <h1>.
 *              Pass false when the surrounding view already renders the H1 (posts, projects, pages without hero).
 *   heroFull : full-bleed photographic hero (home). Default false => editorial hero (text + wide image).
 * Async server components inside (projectsGrid, postsGrid, zones) read the public query layer themselves.
 * Covers every type in src/lib/blocks/schema.ts. Plain-text fields keep line breaks (no HTML/Markdown).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { CmsBlock, BlockOf } from "@/lib/blocks/schema";
import { MediaFrame, PlaceholderBadge, ResponsiveImage, type MediaLike } from "@/components/media/ResponsiveImage";
import { RichText } from "@/components/richtext/RichText";
import { SERVICE_AREAS } from "@/lib/config/site";
import { listPublishedPages, listPublishedPosts, listPublishedProjects } from "@/lib/content/public";
import { PostCard, ProjectCard, ProjectsEmptyState } from "@/components/views/Cards";
import { paragraphs } from "@/components/views/format";
import { ContactCta } from "./ContactCta";

type MediaMap = Record<string, MediaLike>;

function Paras({ text, className = "" }: { text?: string | null; className?: string }) {
  return (
    <>
      {paragraphs(text).map((p, i) => (
        <p key={i} className={className}>
          {p.split("\n").map((line, j, arr) => (
            <span key={j}>
              {line}
              {j < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function SectionHead({ eyebrow, heading, as: H = "h2" }: { eyebrow?: string; heading?: string; as?: "h2" | "h3" }) {
  if (!heading) return null;
  return (
    <header className="mb-10 max-w-3xl lg:mb-14">
      {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
      <H className="display h-section">{heading}</H>
    </header>
  );
}

// ------------------------------------------------------------------ hero

function Hero({ block, media, asH1, full }: { block: BlockOf<"hero">; media: MediaMap; asH1: boolean; full: boolean }) {
  const img = block.imageId ? media[block.imageId] : undefined;
  const H = asH1 ? "h1" : "h2";
  const cta = block.ctaLabel && block.ctaHref ? (
    <Link href={block.ctaHref} className={`btn ${full ? "btn-beige" : "btn-primary"}`}>
      {block.ctaLabel}
    </Link>
  ) : null;

  if (full && img) {
    return (
      <section className="hero-full on-dark" aria-labelledby={block.id ? `${block.id}-h` : undefined}>
        <div className="hero-media fade-in">
          <ResponsiveImage media={img} priority sizes="100vw" />
        </div>
        <div className="wrap w-full pb-14 pt-40 sm:pb-20 lg:pb-24">
          {block.eyebrow && <p className="eyebrow rise mb-6">{block.eyebrow}</p>}
          <H id={block.id ? `${block.id}-h` : undefined} className="display h-hero rise rise-2 max-w-[14ch]">
            {block.heading}
          </H>
          {block.subheading && <p className="lead rise rise-3 mt-8 max-w-xl">{block.subheading}</p>}
          <div className="rise rise-4 mt-10 flex flex-col gap-4 sm:flex-row">
            {cta}
            <Link href="/notre-methode" className="btn btn-outline">
              Notre méthode
            </Link>
          </div>
        </div>
        {img.isPlaceholder && (
          <span className="absolute bottom-4 right-4 sm:bottom-6 sm:right-8">
            <PlaceholderBadge label="Illustration" />
          </span>
        )}
      </section>
    );
  }

  if (full) {
    // Full hero without image: calm charcoal field with a hairline roof motif.
    return (
      <section className="hero-full on-dark">
        <div className="wrap w-full pb-16 pt-40 lg:pb-24">
          {block.eyebrow && <p className="eyebrow rise mb-6">{block.eyebrow}</p>}
          <H className="display h-hero rise rise-2 max-w-[14ch]">{block.heading}</H>
          {block.subheading && <p className="lead rise rise-3 mt-8 max-w-xl">{block.subheading}</p>}
          <div className="rise rise-4 mt-10">{cta}</div>
        </div>
      </section>
    );
  }

  return (
    <section className="wrap pb-6 pt-12 sm:pt-16 lg:pt-24">
      <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          {block.eyebrow && <p className="eyebrow rise mb-5">{block.eyebrow}</p>}
          <H className="display h-page rise rise-2">{block.heading}</H>
        </div>
        {(block.subheading || cta) && (
          <div className="rise rise-3 lg:col-span-4">
            {block.subheading && <p className="lead">{block.subheading}</p>}
            {cta && <div className="mt-6">{cta}</div>}
          </div>
        )}
      </div>
      {img && (
        <div className="rise rise-4 mt-10 lg:mt-14">
          <MediaFrame media={img} ratio="21 / 9" priority sizes="(min-width: 1700px) 1536px, 100vw" frameClassName="!aspect-[4/3] sm:!aspect-[16/9] lg:!aspect-[21/9]" />
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ simple content blocks

function Features({ block }: { block: BlockOf<"features"> }) {
  return (
    <section className="wrap section">
      <SectionHead heading={block.heading} />
      <ul className="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {block.items.map((it, i) => (
          <li key={i} className="card-line reveal pt-6">
            <p className="big-num" aria-hidden="true">
              {String(i + 1).padStart(2, "0")}
            </p>
            <h3 className="display h-card mt-5">{it.title}</h3>
            <div className="mt-3 space-y-3 text-charcoal/85">
              <Paras text={it.text} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Steps({ block }: { block: BlockOf<"steps"> }) {
  return (
    <section className="bg-sand">
      <div className="wrap section grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="lg:sticky lg:top-32">
            {block.heading && <h2 className="display h-section">{block.heading}</h2>}
          </div>
        </div>
        <ol className="lg:col-span-8">
          {block.items.map((it, i) => (
            <li key={i} className="card-line grid gap-4 py-8 sm:grid-cols-[5rem_1fr] sm:gap-8">
              <span className="big-num" aria-hidden="true">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="display h-card">
                  <span className="sr-only">Étape {i + 1} : </span>
                  {it.title}
                </h3>
                <div className="mt-3 max-w-2xl space-y-3 text-charcoal/85">
                  <Paras text={it.text} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Faq({ block }: { block: BlockOf<"faq"> }) {
  return (
    <section className="wrap section">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">{block.heading && <h2 className="display h-section">{block.heading}</h2>}</div>
        <div className="faq lg:col-span-8">
          {block.items.map((it, i) => (
            <details key={i} className="card-line group py-1">
              <summary className="flex min-h-14 items-center justify-between gap-6 py-4">
                <h3 className="display text-[1.35rem] leading-snug sm:text-2xl">{it.question}</h3>
                <span className="plus text-2xl leading-none text-bronze" aria-hidden="true">
                  +
                </span>
              </summary>
              <div className="max-w-2xl space-y-3 pb-6 text-charcoal/85">
                <Paras text={it.answer} />
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ImageBlock({ block, media }: { block: BlockOf<"image">; media: MediaMap }) {
  const m = media[block.mediaId];
  if (!m) return null;
  return (
    <figure className="wrap section-tight">
      <MediaFrame media={m} ratio={m.width && m.height ? `${m.width} / ${m.height}` : "3 / 2"} sizes="(min-width: 1700px) 1536px, 100vw" />
      {(block.caption || m.credit) && (
        <figcaption className="mt-3 text-sm text-bronze">
          {block.caption}
          {m.credit ? `${block.caption ? " · " : ""}${m.credit}` : ""}
        </figcaption>
      )}
    </figure>
  );
}

function Gallery({ block, media }: { block: BlockOf<"gallery">; media: MediaMap }) {
  const items = block.mediaIds.map((id) => media[id]).filter((m): m is MediaLike => !!m);
  if (items.length === 0) return null;
  return (
    <section className="wrap section">
      <SectionHead heading={block.heading} />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:gap-6">
        {items.map((m, i) => {
          const big = i % 5 === 0;
          return (
            <li key={m.storageKey + i} className={big ? "sm:col-span-2 lg:col-span-4" : "lg:col-span-2"}>
              <figure>
                <MediaFrame media={m} ratio={big ? "16 / 10" : "4 / 5"} sizes={big ? "(min-width: 1024px) 66vw, 100vw" : "(min-width: 1024px) 33vw, 50vw"} />
                {m.caption && <figcaption className="mt-2 text-sm text-bronze">{m.caption}</figcaption>}
              </figure>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CtaBand({ block }: { block: BlockOf<"ctaBand"> }) {
  return (
    <section className="on-dark bg-charcoal text-offwhite">
      <div className="wrap section grid gap-8 lg:grid-cols-12 lg:items-end">
        <div className="lg:col-span-8">
          <h2 className="display h-section max-w-3xl">{block.heading}</h2>
          {block.text && <p className="lead mt-5">{block.text}</p>}
        </div>
        <div className="lg:col-span-4 lg:text-right">
          <Link href={block.href} className="btn btn-beige w-full sm:w-auto">
            {block.label}
          </Link>
        </div>
      </div>
    </section>
  );
}

function PlaceholderNotice({ block }: { block: BlockOf<"placeholderNotice"> }) {
  return (
    <aside className="wrap pt-6" aria-label="Contenu de démonstration">
      <p className="flex flex-wrap items-center gap-3 border border-stone bg-sand px-4 py-3 text-sm">
        <PlaceholderBadge inline />
        <span>{block.text}</span>
      </p>
    </aside>
  );
}

// ------------------------------------------------------------------ data blocks (async server components)

async function ProjectsGrid({ block }: { block: BlockOf<"projectsGrid"> }) {
  const projects = await listPublishedProjects({ region: block.region, limit: block.limit });
  return (
    <section className="wrap section">
      <SectionHead eyebrow="Réalisations" heading={block.heading ?? "Nos réalisations"} />
      {projects.length === 0 ? (
        <ProjectsEmptyState headingLevel={3} />
      ) : (
        <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </section>
  );
}

async function PostsGrid({ block }: { block: BlockOf<"postsGrid"> }) {
  const { items } = await listPublishedPosts({ perPage: block.limit, categorySlug: block.categorySlug });
  if (items.length === 0) return null;
  return (
    <section className="wrap section">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4 lg:mb-14">
        <h2 className="display h-section max-w-3xl">{block.heading ?? "Conseils et actualités"}</h2>
        <Link href="/blog" className="arrow-link">
          Tous les articles <span aria-hidden="true">→</span>
        </Link>
      </div>
      <div className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
    </section>
  );
}

async function Zones({ block }: { block: BlockOf<"zones"> }) {
  const pages = await listPublishedPages();
  const live = new Set(pages.map((p) => p.path));
  return (
    <section className="bg-sand">
      <div className="wrap section">
        <div className="mb-10 grid gap-6 lg:mb-14 lg:grid-cols-12">
          <h2 className="display h-section lg:col-span-7">{block.heading ?? "Où nous intervenons"}</h2>
          <div className="lg:col-span-5">
            <Paras
              text={
                block.intro ??
                "Notre siège unique se trouve à Aulnay-sous-Bois. Nous intervenons en Île-de-France et en Normandie, avec une attention particulière portée au département de la Manche."
              }
              className="lead"
            />
          </div>
        </div>
        <ul className="grid gap-px bg-charcoal/20 sm:grid-cols-3">
          {SERVICE_AREAS.map((z, i) => {
            const body = (
              <>
                <p className="big-num" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="display h-card mt-6">{z.name}</h3>
                <p className="mt-3 text-sm opacity-85">
                  {z.kind === "department" ? "Département de la Normandie" : "Région"}
                </p>
                {live.has(z.path) && (
                  <p className="arrow-link mt-8">
                    Découvrir <span aria-hidden="true">→</span>
                  </p>
                )}
              </>
            );
            const cls = `block h-full p-8 lg:p-10 no-underline ${z.highlighted ? "on-dark bg-charcoal text-offwhite" : "bg-offwhite"}`;
            return (
              <li key={z.code}>
                {live.has(z.path) ? (
                  <Link href={`/${z.path}`} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ renderer

export function BlockRenderer({
  blocks,
  media,
  h1 = true,
  heroFull = false,
}: {
  blocks: CmsBlock[];
  media: MediaMap;
  h1?: boolean;
  heroFull?: boolean;
}) {
  return (
    <>
      {blocks.map((b, i): ReactNode => {
        const key = b.id ?? `${b.type}-${i}`;
        switch (b.type) {
          case "hero":
            return <Hero key={key} block={b} media={media} asH1={h1 && i === 0} full={heroFull && i === 0} />;
          case "richText":
            return (
              <section key={key} className="wrap section-tight">
                <RichText doc={b.doc} media={media} />
              </section>
            );
          case "image":
            return <ImageBlock key={key} block={b} media={media} />;
          case "gallery":
            return <Gallery key={key} block={b} media={media} />;
          case "ctaBand":
            return <CtaBand key={key} block={b} />;
          case "features":
            return <Features key={key} block={b} />;
          case "steps":
            return <Steps key={key} block={b} />;
          case "faq":
            return <Faq key={key} block={b} />;
          case "projectsGrid":
            return <ProjectsGrid key={key} block={b} />;
          case "postsGrid":
            return <PostsGrid key={key} block={b} />;
          case "zones":
            return <Zones key={key} block={b} />;
          case "contactForm":
            return <ContactCta key={key} block={b} />;
          case "placeholderNotice":
            return <PlaceholderNotice key={key} block={b} />;
          default:
            return null;
        }
      })}
    </>
  );
}
