import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { parseBlocks } from "@/lib/blocks/schema";
import { toParisLocalInput } from "@/lib/cms/datetime";
import { loadMediaItems, mediaIdsOfBlocks, revisionRows } from "@/lib/cms/queries";
import { PageHeader } from "@/components/admin/AdminShell";
import { PageEditor } from "@/components/admin/PageEditor";
import { Notice } from "@/components/admin/ui";
import type { BlockData } from "@/components/admin/BlockEditor";
import { withIds } from "@/components/admin/defaults";

export const metadata = { title: "Modifier la page" };

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("EDITOR");
  const { id } = await params;
  const page = await db.page.findUnique({ where: { id } });
  if (!page) notFound();
  const [parents, revisions] = await Promise.all([
    db.page.findMany({ where: { deletedAt: null }, select: { id: true, title: true, path: true }, orderBy: { path: "asc" } }),
    revisionRows("page", id),
  ]);
  const parsed = parseBlocks(page.blocks);
  const media = await loadMediaItems([...mediaIdsOfBlocks(page.blocks), page.ogImageId]);
  return (
    <main>
      <PageHeader title={page.title} intro={`/${page.path}`} />
      {page.deletedAt ? <div className="mb-4"><Notice kind="warn">Cette page est dans la corbeille. Restaurez-la depuis la corbeille pour la modifier.</Notice></div> : null}
      {parsed.dropped.length ? <div className="mb-4"><Notice kind="warn">{parsed.dropped.length} bloc(s) invalides ont été ignorés à l’ouverture ; enregistrer les supprimera définitivement.</Notice></div> : null}
      <PageEditor
        id={page.id}
        preview={`/admin/apercu/page/${page.id}`}
        parents={parents}
        revisions={revisions}
        initialMedia={media}
        initial={{
          title: page.title,
          path: page.path,
          template: page.template,
          blocks: withIds(parsed.blocks as unknown as BlockData[]),
          showInNav: page.showInNav,
          navOrder: page.navOrder,
          navLabel: page.navLabel ?? "",
          parentId: page.parentId,
          isPlaceholder: page.isPlaceholder,
          status: { status: page.status, scheduledAt: toParisLocalInput(page.scheduledAt) },
          seo: { metaTitle: page.metaTitle ?? "", metaDescription: page.metaDescription ?? "", ogImageId: page.ogImageId, noindex: page.noindex, canonicalPath: page.canonicalPath ?? "" },
        }}
      />
    </main>
  );
}
