import Link from "next/link";
import { requireRole } from "@/lib/auth/guards";
import { LeadFiltersSchema, listLeads } from "@/lib/cms/leads";
import { LEAD_STATUSES, REGIONS, REGION_NAMES } from "@/lib/cms/constants";
import { formatParis } from "@/lib/cms/datetime";
import { LEAD_STATUS_LABELS, PROJECT_TYPES } from "@/lib/leads/options";
import { LeadPurgeButton } from "@/components/admin/LeadPurge";
import { PageHeader } from "@/components/admin/AdminShell";
import { Card, Notice } from "@/components/admin/ui";
import { btn, inputCls } from "@/components/admin/styles";

export const metadata = { title: "Demandes de devis" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireRole("EDITOR");
  const sp = await searchParams;
  const parsed = LeadFiltersSchema.safeParse(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)));
  const filters = parsed.success ? parsed.data : LeadFiltersSchema.parse({});
  const { items, total, pageCount } = await listLeads(filters);
  const qs = (p: number) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([k, v]) => v && k !== "page").map(([k, v]) => [k, String(v)])), page: String(p) })}`;
  return (
    <main className="space-y-6">
      <PageHeader title="Demandes de devis" intro="Les demandes reçues par le formulaire du site. Les données personnelles sont conservées pour une durée limitée (voir Réglages)." />
      <Notice kind="info">Ces informations sont confidentielles : ne les copiez pas dans des outils non autorisés et supprimez-les à la demande de la personne concernée (RGPD).</Notice>
      <Card>
        <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-sm">Statut<select name="status" defaultValue={filters.status ?? ""} className={inputCls}><option value="">Tous</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}</select></label>
          <label className="text-sm">Région<select name="region" defaultValue={filters.region ?? ""} className={inputCls}><option value="">Toutes</option>{REGIONS.map((r) => <option key={r} value={r}>{REGION_NAMES[r]}</option>)}</select></label>
          <label className="text-sm">Du<input type="date" name="from" defaultValue={filters.from ?? ""} className={inputCls} /></label>
          <label className="text-sm">Au<input type="date" name="to" defaultValue={filters.to ?? ""} className={inputCls} /></label>
          <label className="text-sm">Recherche<input name="q" defaultValue={filters.q ?? ""} maxLength={80} className={inputCls} /></label>
          <div className="flex items-end gap-2"><button type="submit" className={btn.primary}>Filtrer</button><Link href="/admin/demandes" className={btn.ghost}>Réinitialiser</Link></div>
        </form>
      </Card>
      {user.role === "OWNER" ? (
        <form action="/admin/demandes/export" method="post" encType="multipart/form-data" className="flex items-center gap-3">
          {(["status", "region", "from", "to", "q"] as const).map((k) => (filters[k] ? <input key={k} type="hidden" name={k} value={String(filters[k])} /> : null))}
          <button type="submit" className={btn.secondary}>Exporter en CSV (propriétaire)</button>
          <span className="text-xs text-charcoal/60">Export audité ; données personnelles : à manipuler avec précaution.</span>
        </form>
      ) : null}
      {user.role === "OWNER" ? (
        <div className="flex flex-wrap items-center gap-3">
          <LeadPurgeButton />
          <span className="text-xs text-charcoal/60">Efface définitivement les demandes dont la durée de conservation est échue (voir Réglages).</span>
        </div>
      ) : null}
      <p className="text-sm text-charcoal/70">{total} demande{total > 1 ? "s" : ""}</p>
      <div className="overflow-x-auto rounded-sm border border-charcoal/15 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Demandes de devis</caption>
          <thead className="border-b border-charcoal/15 bg-offwhite text-xs uppercase tracking-wide"><tr><th scope="col" className="p-3">Date</th><th scope="col" className="p-3">Contact</th><th scope="col" className="p-3">Projet</th><th scope="col" className="p-3">Lieu</th><th scope="col" className="p-3">Statut</th><th scope="col" className="p-3">E-mail</th></tr></thead>
          <tbody>
            {items.length === 0 ? <tr><td colSpan={6} className="p-6 text-center text-charcoal/70">Aucune demande.</td></tr> : null}
            {items.map((l) => (
              <tr key={l.id} className="border-b border-charcoal/10 last:border-0">
                <td className="p-3 text-xs">{formatParis(l.createdAt)}</td>
                <td className="p-3"><Link href={`/admin/demandes/${l.id}`} className="font-medium hover:underline">{l.name}</Link><span className="block text-xs text-charcoal/60">{l.email}</span></td>
                <td className="p-3">{PROJECT_TYPES[l.projectType as keyof typeof PROJECT_TYPES] ?? l.projectType}{l._count.attachments ? <span className="ml-1 text-xs">· {l._count.attachments} fichier(s)</span> : null}</td>
                <td className="p-3">{l.postalCode} {l.city ?? ""}</td>
                <td className="p-3">{LEAD_STATUS_LABELS[l.status]}</td>
                <td className="p-3 text-xs">{l.mailDeliveryState === "SENT" ? "Envoyé" : l.mailDeliveryState === "FAILED" ? "Échec" : "Non configuré"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-2">
          {filters.page > 1 ? <Link className={btn.secondary} href={qs(filters.page - 1)}>Précédent</Link> : null}
          <span className="text-sm">Page {filters.page} / {pageCount}</span>
          {filters.page < pageCount ? <Link className={btn.secondary} href={qs(filters.page + 1)}>Suivant</Link> : null}
        </nav>
      ) : null}
    </main>
  );
}
