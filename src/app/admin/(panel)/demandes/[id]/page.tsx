import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { formatParis } from "@/lib/cms/datetime";
import { BUDGET_RANGES, LEAD_REGIONS, PROJECT_TYPES, TIMELINES } from "@/lib/leads/options";
import { PageHeader } from "@/components/admin/AdminShell";
import { LeadPanel } from "@/components/admin/LeadPanel";
import { Card } from "@/components/admin/ui";

export const metadata = { title: "Demande" };

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("EDITOR");
  const { id } = await params;
  const lead = await db.lead.findFirst({ where: { id, deletedAt: null }, include: { attachments: true } });
  if (!lead) notFound();
  const rows: [string, string][] = [
    ["Reçue le", formatParis(lead.createdAt)],
    ["Nom", lead.name],
    ["E-mail", lead.email],
    ["Téléphone", lead.phone ?? "—"],
    ["Localisation", `${lead.postalCode} ${lead.city ?? ""}`.trim()],
    ["Région", lead.region ? (LEAD_REGIONS[lead.region] ?? lead.region) : "—"],
    ["Type de projet", PROJECT_TYPES[lead.projectType as keyof typeof PROJECT_TYPES] ?? lead.projectType],
    ["Budget", lead.budgetRange ? (BUDGET_RANGES[lead.budgetRange as keyof typeof BUDGET_RANGES] ?? lead.budgetRange) : "—"],
    ["Délai", lead.desiredTimeline ? (TIMELINES[lead.desiredTimeline as keyof typeof TIMELINES] ?? lead.desiredTimeline) : "—"],
    ["Début souhaité", lead.desiredStartDate ?? "—"],
    ["Provenance", lead.source ?? "—"],
    ["Consentement", `${formatParis(lead.consentAt)} (texte ${lead.consentTextVersion})`],
    ["Conservation jusqu’au", formatParis(lead.retentionUntil, false)],
  ];
  return (
    <main>
      <PageHeader title={lead.name} intro={<Link href="/admin/demandes" className="underline">← Retour aux demandes</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-6">
          <Card title="Demande">
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-charcoal/60">{k}</dt><dd className="break-words">{v}</dd></div>))}
            </dl>
            <h3 className="mt-5 text-sm font-medium">Message</h3>
            {/* plain text only: React escapes it, whitespace preserved */}
            <p className="mt-1 whitespace-pre-wrap break-words rounded-sm bg-offwhite p-3 text-sm">{lead.message}</p>
          </Card>
          <Card title={`Pièces jointes (${lead.attachments.length})`}>
            {lead.attachments.length === 0 ? <p className="text-sm text-charcoal/70">Aucune pièce jointe.</p> : (
              <ul className="space-y-2 text-sm">
                {lead.attachments.map((a) => (
                  <li key={a.id}>
                    {/* forced download through the authenticated route; never a public URL */}
                    <a className="underline" href={`/admin/demandes/${lead.id}/pieces/${a.id}`} download>{a.originalName}</a> <span className="text-xs text-charcoal/60">({(a.sizeBytes / 1024).toFixed(0)} Ko · {a.mime})</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-charcoal/60">Ouvrez les fichiers avec prudence : ils proviennent d’un visiteur anonyme.</p>
          </Card>
        </div>
        <LeadPanel id={lead.id} status={lead.status} notes={lead.internalNotes ?? ""} isOwner={user.role === "OWNER"} mailState={lead.mailDeliveryState} />
      </div>
    </main>
  );
}
