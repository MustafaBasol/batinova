import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { PAGE_TEMPLATES, STATUS_LABELS, TEMPLATE_LABELS, CONTENT_STATUSES, type ContentStatusKey, type PageTemplateKey } from "@/lib/cms/constants";
import { formatParis } from "@/lib/cms/datetime";
import { PageHeader } from "@/components/admin/AdminShell";
import { ActionButton, StatusBadge } from "@/components/admin/ui";
import { btn } from "@/components/admin/styles";
import { duplicatePageAction, softDeleteAction } from "../_actions/content";

export const metadata = { title: "Pages" };

export default async function PagesList({ searchParams }: { searchParams: Promise<{ vue?: string; statut?: string; modele?: string }> }) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const services = sp.vue === "services";
  const statut = (CONTENT_STATUSES as readonly string[]).includes(sp.statut ?? "") ? (sp.statut as ContentStatusKey) : undefined;
  const modele = (PAGE_TEMPLATES as readonly string[]).includes(sp.modele ?? "") ? (sp.modele as PageTemplateKey) : undefined;
  const pages = await db.page.findMany({
    where: { deletedAt: null, ...(services ? { template: "SERVICE" } : modele ? { template: modele } : {}), ...(statut ? { status: statut } : {}) },
    orderBy: [{ path: "asc" }],
    select: { id: true, title: true, path: true, template: true, status: true, updatedAt: true, isPlaceholder: true, scheduledAt: true },
  });
  return (
    <main>
      <PageHeader
        title={services ? "Services" : "Pages"}
        intro={services ? "Chaque service est une page avec le modèle « Service » (adresse sous /services/…)." : "Pages du site : accueil, à propos, services, zones, pages légales…"}
        actions={<Link href={services ? "/admin/pages/nouvelle?template=SERVICE" : "/admin/pages/nouvelle"} className={btn.primary}>{services ? "Nouveau service" : "Nouvelle page"}</Link>}
      />
      <nav aria-label="Filtres" className="mb-4 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/pages" className={btn.secondary + " " + btn.small}>Toutes</Link>
        <Link href="/admin/pages?vue=services" className={btn.secondary + " " + btn.small}>Services</Link>
        {CONTENT_STATUSES.map((s) => <Link key={s} href={`/admin/pages?statut=${s}`} className={btn.secondary + " " + btn.small}>{STATUS_LABELS[s]}</Link>)}
      </nav>
      <div className="overflow-x-auto rounded-sm border border-charcoal/15 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Liste des pages</caption>
          <thead className="border-b border-charcoal/15 bg-offwhite text-xs uppercase tracking-wide">
            <tr><th scope="col" className="p-3">Titre</th><th scope="col" className="p-3">Adresse</th><th scope="col" className="p-3">Modèle</th><th scope="col" className="p-3">État</th><th scope="col" className="p-3">Modifié</th><th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {pages.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-charcoal/70">Aucune page.</td></tr> : null}
            {pages.map((p) => (
              <tr key={p.id} className="border-b border-charcoal/10 last:border-0">
                <td className="p-3"><Link href={`/admin/pages/${p.id}`} className="font-medium hover:underline">{p.title}</Link>{p.isPlaceholder ? <span className="ml-2 rounded-sm bg-amber-100 px-1.5 text-xs text-amber-900">démo</span> : null}</td>
                <td className="p-3 font-mono text-xs">/{p.path}</td>
                <td className="p-3">{TEMPLATE_LABELS[p.template]}</td>
                <td className="p-3"><StatusBadge status={p.status} />{p.status === "SCHEDULED" ? <span className="block text-xs text-charcoal/60">{formatParis(p.scheduledAt)}</span> : null}</td>
                <td className="p-3 text-xs">{formatParis(p.updatedAt)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/pages/${p.id}`} className={btn.secondary + " " + btn.small}>Modifier</Link>
                    <ActionButton run={duplicatePageAction.bind(null, p.id)}>Dupliquer</ActionButton>
                    {p.path !== "" ? <ActionButton variant="danger" run={softDeleteAction.bind(null, "page", p.id)} confirm={{ title: `Mettre « ${p.title} » à la corbeille ?`, message: "La page disparaît du site. Restauration possible.", confirmLabel: "Mettre à la corbeille", danger: true }}>Supprimer</ActionButton> : null}
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
