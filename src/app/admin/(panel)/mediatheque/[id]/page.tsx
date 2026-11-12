import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { mediaUrl } from "@/lib/content/paths";
import { findMediaUsages } from "@/lib/media/service";
import { PageHeader } from "@/components/admin/AdminShell";
import { MediaDetail } from "@/components/admin/MediaLibrary";
import type { LicenseTypeKey } from "@/lib/cms/constants";

export const metadata = { title: "Média" };

export default async function MediaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("EDITOR");
  const { id } = await params;
  const m = await db.media.findUnique({ where: { id } });
  if (!m) notFound();
  const usages = await findMediaUsages(id);
  return (
    <main>
      <PageHeader title={m.originalName} intro="Texte alternatif, licence, recadrage et utilisations." />
      <MediaDetail
        usages={usages}
        media={{
          id: m.id, url: mediaUrl(m.storageKey), sourceUrl: `/admin/mediatheque/${m.id}/source`, width: m.width, height: m.height, originalName: m.originalName,
          sizeBytes: m.sizeBytes, alt: m.alt, caption: m.caption ?? "", credit: m.credit ?? "", licenseType: m.licenseType as LicenseTypeKey,
          licenseSource: m.licenseSource ?? "", licenseNotes: m.licenseNotes ?? "", isPlaceholder: m.isPlaceholder, focalX: m.focalX, focalY: m.focalY,
          deleted: !!m.deletedAt, masterWidth: m.width,
        }}
      />
    </main>
  );
}
