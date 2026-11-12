import { requireRole } from "@/lib/auth/guards";
import { TRASH_KIND_LABELS } from "@/lib/cms/constants";
import { formatParis } from "@/lib/cms/datetime";
import { listTrash } from "@/lib/cms/trash";
import { PageHeader } from "@/components/admin/AdminShell";
import { ActionButton, Notice } from "@/components/admin/ui";
import { purgeAction, restoreAction } from "../_actions/content";

export const metadata = { title: "Corbeille" };

export default async function TrashPage() {
  const user = await requireRole("EDITOR");
  const items = await listTrash();
  const isOwner = user.role === "OWNER";
  return (
    <main className="space-y-4">
      <PageHeader title="Corbeille" intro="Éléments supprimés, restaurables. Leur adresse reste réservée tant qu’ils sont ici." />
      {!isOwner ? <Notice kind="info">La suppression définitive est réservée au propriétaire.</Notice> : null}
      <div className="overflow-x-auto rounded-sm border border-charcoal/15 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Éléments supprimés</caption>
          <thead className="border-b border-charcoal/15 bg-offwhite text-xs uppercase tracking-wide"><tr><th scope="col" className="p-3">Type</th><th scope="col" className="p-3">Élément</th><th scope="col" className="p-3">Supprimé le</th><th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={4} className="p-6 text-center text-charcoal/70">La corbeille est vide.</td></tr> : null}
            {items.map((i) => (
              <tr key={`${i.kind}-${i.id}`} className="border-b border-charcoal/10 last:border-0">
                <td className="p-3">{TRASH_KIND_LABELS[i.kind]}</td>
                <td className="p-3"><span className="font-medium">{i.label}</span><span className="block font-mono text-xs text-charcoal/60">{i.detail}</span></td>
                <td className="p-3 text-xs">{formatParis(i.deletedAt)}</td>
                <td className="p-3"><div className="flex gap-2">
                  <ActionButton run={restoreAction.bind(null, i.kind, i.id)}>Restaurer</ActionButton>
                  {isOwner ? <ActionButton variant="danger" run={purgeAction.bind(null, i.kind, i.id)} confirm={{ title: "Supprimer définitivement ?", message: `« ${i.label} » sera effacé pour toujours. Cette action est irréversible.`, confirmLabel: "Supprimer définitivement", danger: true }}>Supprimer définitivement</ActionButton> : null}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
