// Private preview of drafts / scheduled / unpublished content (owner: cms-admin).
// Lives under /admin: the (panel) layout AND this page call requireRole(); anonymous visitors are redirected
// to the login. Rendering reuses the presentational public views, so what you see is what will be published.
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { parseBlocks } from "@/lib/blocks/schema";
import { STATUS_LABELS } from "@/lib/cms/constants";
import { formatParis } from "@/lib/cms/datetime";
import { isPubliclyVisible } from "@/lib/content/publish";
import { parseRichText } from "@/lib/richtext/schema";
import { PageView } from "@/components/views/PageView";
import { PostView } from "@/components/views/PostView";
import { ProjectView } from "@/components/views/ProjectView";
import { loadMediaMap } from "@/components/views/media-map";
import type { MediaLike } from "@/components/media/ResponsiveImage";
import { btn } from "@/components/admin/styles";

export const metadata = { title: "Aperçu", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

async function oneMedia(id: string | null): Promise<MediaLike | null> {
  if (!id) return null;
  const m = (await loadMediaMap([], [], [id]))[id];
  return m ?? null;
}

export default async function PreviewPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  await requireRole("EDITOR");
  const { type, id } = await params;
  let banner: { status: string; scheduled: Date | null; visible: boolean; trashed: boolean; edit: string; label: string };
  let body: React.ReactNode;

  if (type === "page") {
    const p = await db.page.findUnique({ where: { id }, include: { parent: { select: { path: true, title: true } } } });
    if (!p) notFound();
    const blocks = parseBlocks(p.blocks).blocks;
    const media = await loadMediaMap(blocks);
    banner = { status: STATUS_LABELS[p.status], scheduled: p.scheduledAt, visible: isPubliclyVisible(p), trashed: !!p.deletedAt, edit: `/admin/pages/${p.id}`, label: "Page" };
    body = <PageView page={{ path: p.path, title: p.title, template: p.template, blocks, isPlaceholder: p.isPlaceholder, parent: p.parent }} media={media} />;
  } else if (type === "article") {
    const p = await db.post.findUnique({ where: { id }, include: { category: { select: { slug: true, name: true } }, tags: { include: { tag: true } } } });
    if (!p) notFound();
    const doc = parseRichText(p.body);
    const blocks = parseBlocks(p.blocks).blocks;
    const [media, cover] = await Promise.all([loadMediaMap(blocks, [doc]), oneMedia(p.coverImageId)]);
    banner = { status: STATUS_LABELS[p.status], scheduled: p.scheduledAt, visible: isPubliclyVisible(p), trashed: !!p.deletedAt, edit: `/admin/articles/${p.id}`, label: "Article" };
    body = (
      <PostView
        media={media}
        post={{
          slug: p.slug, title: p.title, excerpt: p.excerpt, body: doc, blocks, publishedAt: p.publishedAt, scheduledAt: p.scheduledAt, updatedAt: p.updatedAt,
          readingMinutes: p.readingMinutes, authorDisplayName: p.authorDisplayName, isPlaceholder: p.isPlaceholder, coverImage: cover,
          category: p.category, tags: p.tags.filter((t) => !t.tag.deletedAt).map((t) => ({ slug: t.tag.slug, name: t.tag.name })),
        }}
      />
    );
  } else if (type === "projet") {
    const p = await db.project.findUnique({ where: { id }, include: { media: { orderBy: { sortOrder: "asc" }, include: { media: true } } } });
    if (!p) notFound();
    const blocks = parseBlocks(p.blocks).blocks;
    const ids = p.media.map((m) => m.mediaId);
    const [media, cover] = await Promise.all([loadMediaMap(blocks, [], ids), oneMedia(p.coverImageId)]);
    banner = { status: STATUS_LABELS[p.status], scheduled: p.scheduledAt, visible: isPubliclyVisible(p), trashed: !!p.deletedAt, edit: `/admin/realisations/${p.id}`, label: "Réalisation" };
    body = (
      <ProjectView
        media={media}
        project={{
          slug: p.slug, title: p.title, summary: p.summary, region: p.region, locationLabel: p.locationLabel, isPlaceholder: p.isPlaceholder, coverImage: cover, blocks,
          media: p.media.filter((m) => media[m.mediaId] && !m.media.deletedAt).map((m) => ({ role: m.role, media: media[m.mediaId]! })),
        }}
      />
    );
  } else {
    notFound();
  }

  return (
    <div>
      <div role="status" className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-amber-600/50 bg-amber-50 px-4 py-2 text-sm text-amber-950">
        <strong>Aperçu privé — {banner.label}</strong>
        <span>
          État : {banner.status}
          {banner.scheduled ? ` (le ${formatParis(banner.scheduled)})` : ""} · {banner.trashed ? "dans la corbeille" : banner.visible ? "actuellement visible par le public" : "pas visible par le public"}
        </span>
        <Link href={banner.edit} className={btn.secondary + " " + btn.small + " ml-auto"}>Retour à l’édition</Link>
      </div>
      {body}
    </div>
  );
}
