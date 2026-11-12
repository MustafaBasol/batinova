/* eslint-disable @next/next/no-img-element -- admin thumbnails of our own media */
import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { LICENSE_LABELS } from "@/lib/cms/constants";
import { mediaUrl } from "@/lib/content/paths";
import { PageHeader } from "@/components/admin/AdminShell";
import { UploadPanel } from "@/components/admin/MediaLibrary";
import { btn } from "@/components/admin/styles";

export const metadata = { title: "Médiathèque" };
const PER_PAGE = 48;

export default async function MediaPage({ searchParams }: { searchParams: Promise<{ q?: string; filtre?: string; page?: string }> }) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const filtre = ["sans-alt", "demo"].includes(sp.filtre ?? "") ? sp.filtre : undefined;
  const page = Math.max(1, Math.min(500, Number(sp.page) || 1));
  const where = {
    deletedAt: null,
    ...(filtre === "sans-alt" ? { alt: "" } : {}),
    ...(filtre === "demo" ? { isPlaceholder: true } : {}),
    ...(q ? { OR: [{ alt: { contains: q } }, { originalName: { contains: q } }, { credit: { contains: q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    db.media.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE }),
    db.media.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(filtre ? { filtre } : {}), page: String(p) })}`;
  return (
    <main className="space-y-6">
      <PageHeader title="Médiathèque" intro="Toutes les images du site. Chaque image publiée doit avoir un texte alternatif et une licence renseignée." />
      <UploadPanel />
      <form role="search" className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="mq" className="block text-sm font-medium">Rechercher</label>
          <input id="mq" name="q" defaultValue={q} className="rounded-sm border border-charcoal/30 bg-white px-3 py-2 text-sm" />
        </div>
        {filtre ? <input type="hidden" name="filtre" value={filtre} /> : null}
        <button className={btn.secondary} type="submit">Chercher</button>
        <Link href="/admin/mediatheque" className={btn.ghost}>Toutes</Link>
        <Link href="/admin/mediatheque?filtre=sans-alt" className={btn.ghost}>Sans texte alternatif</Link>
        <Link href="/admin/mediatheque?filtre=demo" className={btn.ghost}>Démonstration</Link>
      </form>
      <p className="text-sm text-charcoal/70">{total} image{total > 1 ? "s" : ""}</p>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {items.map((m) => (
          <li key={m.id}>
            <Link href={`/admin/mediatheque/${m.id}`} className="block rounded-sm border border-charcoal/20 bg-white hover:border-charcoal">
              <img src={mediaUrl(m.storageKey)} alt="" loading="lazy" className="aspect-square w-full bg-offwhite object-cover" />
              <span className="block space-y-0.5 p-2 text-xs">
                <span className="block truncate font-medium">{m.originalName}</span>
                {m.alt ? <span className="block truncate text-charcoal/70">{m.alt}</span> : <span className="block font-medium text-red-700">Texte alternatif manquant</span>}
                <span className="block text-charcoal/60">{LICENSE_LABELS[m.licenseType]}</span>
                {m.isPlaceholder ? <span className="inline-block rounded-sm bg-amber-100 px-1.5 text-amber-900">démo</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav aria-label="Pagination" className="flex gap-2">
          {page > 1 ? <Link className={btn.secondary} href={qs(page - 1)}>Précédent</Link> : null}
          <span className="px-2 py-2 text-sm">Page {page} / {pages}</span>
          {page < pages ? <Link className={btn.secondary} href={qs(page + 1)}>Suivant</Link> : null}
        </nav>
      ) : null}
    </main>
  );
}
