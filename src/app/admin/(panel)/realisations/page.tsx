import Link from "next/link";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { REGION_NAMES } from "@/lib/cms/constants";
import { formatParis } from "@/lib/cms/datetime";
import { PageHeader } from "@/components/admin/AdminShell";
import { ActionButton, StatusBadge } from "@/components/admin/ui";
import { btn } from "@/components/admin/styles";
import { softDeleteAction, unpublishAction } from "../_actions/content";

export const metadata = { title: "Réalisations" };

export default async function ProjectsList() {
  await requireRole("EDITOR");
  const projects = await db.project.findMany({ where: { deletedAt: null }, orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }] });
  return (
    <main>
      <PageHeader title="Réalisations" intro="Portfolio. Les réalisations d’exemple sont marquées « démo » : ne les présentez jamais comme de vrais chantiers." actions={<Link href="/admin/realisations/nouvelle" className={btn.primary}>Nouvelle réalisation</Link>} />
      <div className="overflow-x-auto rounded-sm border border-charcoal/15 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Liste des réalisations</caption>
          <thead className="border-b border-charcoal/15 bg-offwhite text-xs uppercase tracking-wide">
            <tr><th scope="col" className="p-3">Titre</th><th scope="col" className="p-3">Région</th><th scope="col" className="p-3">État</th><th scope="col" className="p-3">Modifié</th><th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {projects.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-charcoal/70">Aucune réalisation.</td></tr> : null}
            {projects.map((p) => (
              <tr key={p.id} className="border-b border-charcoal/10 last:border-0">
                <td className="p-3"><Link href={`/admin/realisations/${p.id}`} className="font-medium hover:underline">{p.title}</Link>{p.isPlaceholder ? <span className="ml-2 rounded-sm bg-amber-100 px-1.5 text-xs text-amber-900">démo</span> : null}</td>
                <td className="p-3">{p.region ? REGION_NAMES[p.region] : "—"}</td>
                <td className="p-3"><StatusBadge status={p.status} /></td>
                <td className="p-3 text-xs">{formatParis(p.updatedAt)}</td>
                <td className="p-3"><div className="flex flex-wrap gap-2">
                  <Link href={`/admin/realisations/${p.id}`} className={btn.secondary + " " + btn.small}>Modifier</Link>
                  {p.status === "PUBLISHED" || p.status === "SCHEDULED" ? <ActionButton run={unpublishAction.bind(null, "project", p.id)} confirm={{ title: "Dépublier ?", message: "Repasse en brouillon.", confirmLabel: "Dépublier" }}>Dépublier</ActionButton> : null}
                  <ActionButton variant="danger" run={softDeleteAction.bind(null, "project", p.id)} confirm={{ title: `Mettre « ${p.title} » à la corbeille ?`, confirmLabel: "Mettre à la corbeille", danger: true }}>Supprimer</ActionButton>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
