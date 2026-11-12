import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { CONTENT_STATUSES, STATUS_LABELS, type ContentStatusKey } from "@/lib/cms/constants";
import { formatParis } from "@/lib/cms/datetime";
import { PageHeader } from "@/components/admin/AdminShell";
import { ActionButton, StatusBadge } from "@/components/admin/ui";
import { btn } from "@/components/admin/styles";
import { softDeleteAction, unpublishAction } from "../_actions/content";

export const metadata = { title: "Articles" };

export default async function PostsList({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const statut = (CONTENT_STATUSES as readonly string[]).includes(sp.statut ?? "") ? (sp.statut as ContentStatusKey) : undefined;
  const posts = await db.post.findMany({
    where: { deletedAt: null, ...(statut ? { status: statut } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { category: { select: { name: true } } },
  });
  return (
    <main>
      <PageHeader title="Articles" intro="Articles du blog. Les articles d’exemple sont des articles ordinaires : modifiables, dépubliables et supprimables." actions={<Link href="/admin/articles/nouveau" className={btn.primary}>Nouvel article</Link>} />
      <nav aria-label="Filtres" className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/articles" className={btn.secondary + " " + btn.small}>Tous</Link>
        {CONTENT_STATUSES.map((s) => <Link key={s} href={`/admin/articles?statut=${s}`} className={btn.secondary + " " + btn.small}>{STATUS_LABELS[s]}</Link>)}
      </nav>
      <div className="overflow-x-auto rounded-sm border border-charcoal/15 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Liste des articles</caption>
          <thead className="border-b border-charcoal/15 bg-offwhite text-xs uppercase tracking-wide">
            <tr><th scope="col" className="p-3">Titre</th><th scope="col" className="p-3">Catégorie</th><th scope="col" className="p-3">État</th><th scope="col" className="p-3">Modifié</th><th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {posts.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-charcoal/70">Aucun article.</td></tr> : null}
            {posts.map((p) => (
              <tr key={p.id} className="border-b border-charcoal/10 last:border-0">
                <td className="p-3"><Link href={`/admin/articles/${p.id}`} className="font-medium hover:underline">{p.title}</Link>{p.isPlaceholder ? <span className="ml-2 rounded-sm bg-amber-100 px-1.5 text-xs text-amber-900">démo</span> : null}<span className="block font-mono text-xs text-charcoal/60">/blog/{p.slug}</span></td>
                <td className="p-3">{p.category?.name ?? "—"}</td>
                <td className="p-3"><StatusBadge status={p.status} />{p.status === "SCHEDULED" ? <span className="block text-xs text-charcoal/60">{formatParis(p.scheduledAt)}</span> : null}</td>
                <td className="p-3 text-xs">{formatParis(p.updatedAt)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/articles/${p.id}`} className={btn.secondary + " " + btn.small}>Modifier</Link>
                    {p.status === "PUBLISHED" || p.status === "SCHEDULED" ? <ActionButton run={unpublishAction.bind(null, "post", p.id)} confirm={{ title: "Dépublier cet article ?", message: "Il repasse en brouillon.", confirmLabel: "Dépublier" }}>Dépublier</ActionButton> : null}
                    <ActionButton variant="danger" run={softDeleteAction.bind(null, "post", p.id)} confirm={{ title: `Mettre « ${p.title} » à la corbeille ?`, message: "Restauration possible depuis la corbeille.", confirmLabel: "Mettre à la corbeille", danger: true }}>Supprimer</ActionButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
