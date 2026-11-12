import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { parseBlocks } from "@/lib/blocks/schema";
import { toParisLocalInput } from "@/lib/cms/datetime";
import { loadMediaItems, mediaIdsOfBlocks, revisionRows } from "@/lib/cms/queries";
import { PageHeader } from "@/components/admin/AdminShell";
import { ProjectEditor } from "@/components/admin/ProjectEditor";
import type { BlockData } from "@/components/admin/BlockEditor";
import { withIds } from "@/components/admin/defaults";
import { Notice } from "@/components/admin/ui";

export const metadata = { title: "Modifier la réalisation" };

export default async function EditProject({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("EDITOR");
  const { id } = await params;
  const p = await db.project.findUnique({ where: { id }, include: { media: { orderBy: { sortOrder: "asc" } } } });
  if (!p) notFound();
  const revisions = await revisionRows("project", id);
  const gallery = p.media.filter((m) => m.role === "GALLERY").map((m) => m.mediaId);
  const befores = p.media.filter((m) => m.role === "BEFORE");
  const pairs = befores.map((b) => ({
    beforeId: b.mediaId as string | null,
    afterId: (p.media.find((a) => a.role === "AFTER" && a.sortOrder === b.sortOrder)?.mediaId ?? null) as string | null,
  }));
  const media = await loadMediaItems([...p.media.map((m) => m.mediaId), p.coverImageId, p.ogImageId, ...mediaIdsOfBlocks(p.blocks)]);
  const live = p.status === "PUBLISHED" || p.status === "SCHEDULED";
  return (
    <main>
      <PageHeader title={p.title} intro={`/realisations/${p.slug}`} />
      {p.deletedAt ? <div className="mb-4"><Notice kind="warn">Cette réalisation est dans la corbeille. Restaurez-la pour la modifier.</Notice></div> : null}
      <ProjectEditor
        id={p.id}
        isLive={live && !p.deletedAt}
        preview={`/admin/apercu/projet/${p.id}`}
        revisions={revisions}
        initialMedia={media}
        initial={{
          title: p.title, slug: p.slug, summary: p.summary ?? "", region: p.region ?? "", locationLabel: p.locationLabel ?? "",
          blocks: withIds(parseBlocks(p.blocks).blocks as unknown as BlockData[]), coverImageId: p.coverImageId, sortOrder: p.sortOrder,
          isPlaceholder: p.isPlaceholder, gallery, pairs,
          status: { status: p.status, scheduledAt: toParisLocalInput(p.scheduledAt) },
          seo: { metaTitle: p.metaTitle ?? "", metaDescription: p.metaDescription ?? "", ogImageId: p.ogImageId, noindex: p.noindex, canonicalPath: p.canonicalPath ?? "" },
        }}
      />
    </main>
  );
}
