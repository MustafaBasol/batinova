// Dashboard. Owner: cms-admin. Keep the requireUser() call.
import Link from "next/link";
import { requireUser } from "@/lib/auth/guards";
import { formatParis } from "@/lib/cms/datetime";
import { getDashboardData } from "@/lib/cms/dashboard";
import { LEAD_STATUS_LABELS, PROJECT_TYPES } from "@/lib/leads/options";
import { PageHeader } from "@/components/admin/AdminShell";
import { Card, Notice } from "@/components/admin/ui";
import { btn, cx } from "@/components/admin/styles";

export const metadata = { title: "Tableau de bord" };

export default async function AdminHomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const d = await getDashboardData();
  const isOwner = user.role === "OWNER";
  const tiles = [
    { label: "Nouvelles demandes", value: d.newLeads, href: "/admin/demandes?status=NEW", tone: d.newLeads > 0 },
    { label: "Brouillons", value: d.drafts.total, href: "/admin/pages", sub: `${d.drafts.pages} pages · ${d.drafts.posts} articles · ${d.drafts.projects} réalisations` },
    { label: "Programmés", value: d.scheduled.total, href: "/admin/articles", sub: `${d.scheduled.pages} pages · ${d.scheduled.posts} articles · ${d.scheduled.projects} réalisations` },
  ];
  return (
    <main>
      <PageHeader title="Tableau de bord" intro={`Bienvenue, ${user.name}.`} />
      {sp.refus ? <div className="mb-4"><Notice kind="error">Accès refusé : cette action est réservée au propriétaire.</Notice></div> : null}

      <div className="mb-6 space-y-3">
        {!d.mail.enabled ? (
          <Notice kind="warn">
            <strong>E-mail de notification non configuré.</strong> Les demandes de devis sont enregistrées dans l’administration mais aucun e-mail n’est envoyé
            {!d.mail.smtpEnvPresent ? " (variables SMTP absentes du serveur)" : !d.mail.settingEnabled ? " (envoi désactivé dans les réglages)" : ""}. Consultez la section « Demandes de devis » régulièrement.
            {isOwner ? <> <Link href="/admin/reglages" className="underline">Voir les réglages</Link></> : null}
          </Notice>
        ) : (
          <Notice kind="ok">Notifications e-mail actives.</Notice>
        )}
        {d.missingAlt > 0 ? <Notice kind="warn">{d.missingAlt} image{d.missingAlt > 1 ? "s" : ""} sans texte alternatif : requis pour publier. <Link href="/admin/mediatheque?filtre=sans-alt" className="underline">Les corriger</Link></Notice> : null}
      </div>

      <ul className="mb-6 grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className={cx("block rounded-sm border bg-white p-4 hover:border-charcoal", t.tone ? "border-beige" : "border-charcoal/15")}>
              <span className="block text-3xl font-serif">{t.value}</span>
              <span className="block text-sm font-medium">{t.label}</span>
              {t.sub ? <span className="block text-xs text-charcoal/60">{t.sub}</span> : null}
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Actions rapides">
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/articles/nouveau" className={btn.primary}>Nouvel article</Link>
            <Link href="/admin/pages/nouvelle" className={btn.secondary}>Nouvelle page</Link>
            <Link href="/admin/pages/nouvelle?template=SERVICE" className={btn.secondary}>Nouveau service</Link>
            <Link href="/admin/realisations/nouvelle" className={btn.secondary}>Nouvelle réalisation</Link>
            <Link href="/admin/mediatheque" className={btn.secondary}>Médiathèque</Link>
          </div>
        </Card>

        <Card title="Dernières demandes" actions={<Link href="/admin/demandes" className="text-sm underline">Tout voir</Link>}>
          {d.recentLeads.length === 0 ? (
            <p className="text-sm text-charcoal/70">Aucune demande pour le moment.</p>
          ) : (
            <ul className="divide-y divide-charcoal/10">
              {d.recentLeads.map((l) => (
                <li key={l.id} className="py-2 text-sm">
                  <Link href={`/admin/demandes/${l.id}`} className="flex flex-wrap justify-between gap-2 hover:underline">
                    <span>{l.name} · {PROJECT_TYPES[l.projectType as keyof typeof PROJECT_TYPES] ?? l.projectType} · {l.postalCode}</span>
                    <span className="text-xs text-charcoal/70">{LEAD_STATUS_LABELS[l.status]} · {formatParis(l.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {isOwner ? (
          <Card title="Liste de contrôle propriétaire" className="lg:col-span-2">
            <ul className="space-y-2 text-sm">
              <Check ok={d.checklist.unverifiedCompany === 0} text={`Identité de l’entreprise : ${d.checklist.companyTotal - d.checklist.unverifiedCompany}/${d.checklist.companyTotal} champs vérifiés`} href="/admin/reglages#entreprise" hint="SIREN, RCS, assurance… ne s’affichent publiquement que lorsqu’ils sont marqués « vérifié »." />
              <Check ok={d.checklist.addressVerified} text="Adresse du siège confirmée par le propriétaire" href="/admin/reglages#adresse" />
              <Check ok={d.checklist.mailboxesProvisioned > 0} text={`Boîtes e-mail créées et vérifiées : ${d.checklist.mailboxesProvisioned}/5`} href="/admin/reglages#email" hint="Ne cochez « provisionnée » qu’une fois la boîte réellement créée (MX vérifié)." />
              <Check ok={d.checklist.retentionConfirmed} text="Durée de conservation des demandes validée" href="/admin/reglages#demandes" />
              <Check ok={d.placeholders.total === 0} text={`Contenus de démonstration restants : ${d.placeholders.total} (dont ${d.placeholders.media} médias)`} href="/admin/pages" hint="À remplacer ou à assumer avant la mise en ligne." />
              {d.leadsExpiring > 0 ? <Check ok={false} text={`${d.leadsExpiring} demande(s) arrivent à échéance de conservation sous 30 jours`} href="/admin/demandes" /> : null}
            </ul>
          </Card>
        ) : null}
      </div>
    </main>
  );
}

function Check({ ok, text, href, hint }: { ok: boolean; text: string; href: string; hint?: string }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className={ok ? "text-emerald-700" : "text-amber-700"}>{ok ? "✔" : "●"}</span>
      <span>
        <Link href={href} className="hover:underline">{text}</Link>
        <span className="sr-only">{ok ? " — fait" : " — à faire"}</span>
        {hint && !ok ? <span className="block text-xs text-charcoal/60">{hint}</span> : null}
      </span>
    </li>
  );
}
