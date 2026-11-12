"use client";
// OWNER settings (owner: cms-admin). One independent form per settings group; the server action re-checks OWNER.
/* eslint-disable @next/next/no-img-element -- previews of our own media */
import { useState, type ReactNode } from "react";
import { saveSettingsAction } from "@/app/admin/(panel)/_actions/admin";
import type { SiteSettings } from "@/lib/settings-schema";
import { MediaField, MediaPickerDialog, useMediaItems } from "./MediaPicker";
import { Card, Notice, Select, TextArea, TextInput, Toggle, btn, cx, useRunner } from "./ui";

function Section({ id, title, intro, onSave, children }: { id: string; title: string; intro?: ReactNode; onSave: () => Promise<import("@/lib/cms/result").ActionResult>; children: ReactNode }) {
  const { run, pending } = useRunner();
  return (
    <section id={id} className="scroll-mt-6">
      <Card title={title}>
        {intro ? <div className="mb-4 text-sm text-charcoal/70">{intro}</div> : null}
        <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(onSave); }}>
          {children}
          <button type="submit" className={btn.primary} disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
        </form>
      </Card>
    </section>
  );
}

// ------------------------------------------------------------------ branding

type Branding = SiteSettings["branding"];
const SLOTS: { key: keyof Branding; label: string; help: string }[] = [
  { key: "logoMediaId", label: "Logo principal (couleur)", help: "Utilisé sur fond clair." },
  { key: "logoMonoMediaId", label: "Logo monochrome", help: "Version une couleur (impressions, pied de page clair…)." },
  { key: "logoOnDarkMediaId", label: "Logo pour fond sombre", help: "Version claire à utiliser sur fond anthracite." },
];

function LogoSlot({ label, help, value, onChange }: { label: string; help: string; value: string | null; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const items = useMediaItems(value ? [value] : []);
  const m = value ? items[value] : undefined;
  return (
    <fieldset className="space-y-3 rounded-sm border border-charcoal/20 p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>
      <p className="text-xs text-charcoal/60">{help}</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex h-24 items-center justify-center rounded-sm border border-charcoal/10 bg-[#F5F2EC] p-2" aria-label="Aperçu sur fond clair">
          {m ? <img src={m.url} alt={m.alt || "Logo"} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-charcoal/60">{value ? "Chargement…" : "Logo officiel"}</span>}
        </div>
        <div className="flex h-24 items-center justify-center rounded-sm bg-[#303030] p-2" aria-label="Aperçu sur fond sombre">
          {m ? <img src={m.url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-white/70">{value ? "Chargement…" : "Logo officiel"}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={cx(btn.secondary, btn.small)} onClick={() => setOpen(true)}>{value ? "Changer" : "Choisir une image"}</button>
        {value ? <button type="button" className={cx(btn.ghost, btn.small)} onClick={() => onChange(null)}>Revenir au logo officiel</button> : null}
      </div>
      <MediaPickerDialog open={open} onClose={() => setOpen(false)} onPick={(it) => { onChange(it.id); setOpen(false); }} />
    </fieldset>
  );
}

function BrandingSection({ initial }: { initial: Branding }) {
  const [b, setB] = useState(initial);
  return (
    <Section
      id="marque"
      title="Marque / Logo"
      intro={<>Remplacez les logos affichés sur le site. <strong>PNG transparent recommandé</strong> (ou WebP) ; les proportions sont conservées. Aucune image choisie = logo officiel fourni avec le site. Les favicons ne sont pas modifiables ici.</>}
      onSave={() => saveSettingsAction("branding", b)}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {SLOTS.map((s) => <LogoSlot key={s.key} label={s.label} help={s.help} value={b[s.key]} onChange={(v) => setB({ ...b, [s.key]: v })} />)}
      </div>
      <button type="button" className={btn.secondary} onClick={() => setB({ logoMediaId: null, logoMonoMediaId: null, logoOnDarkMediaId: null })}>Tout réinitialiser (logos officiels)</button>
      <p className="text-xs text-charcoal/60">Pensez à renseigner le texte alternatif de chaque logo dans la médiathèque.</p>
    </Section>
  );
}

// ------------------------------------------------------------------ company

const COMPANY_LABELS: Record<keyof SiteSettings["company"], string> = {
  legalName: "Dénomination sociale", tradeName: "Nom commercial", legalForm: "Forme juridique", siren: "SIREN", siret: "SIRET", rcs: "RCS (ville d’immatriculation)",
  tvaNumber: "N° de TVA intracommunautaire", capital: "Capital social", director: "Directeur de la publication", phone: "Téléphone", publicEmail: "E-mail public",
  hostingProvider: "Hébergeur (nom, adresse, téléphone)", insurance: "Assurance décennale (assureur, n° de contrat)", privacyController: "Responsable du traitement des données",
};

function CompanySection({ initial }: { initial: SiteSettings["company"] }) {
  const [c, setC] = useState(initial);
  return (
    <Section id="entreprise" title="Identité de l’entreprise" intro="Ne saisissez que des informations réelles. Une valeur ne s’affiche publiquement que lorsque « vérifié » est coché : cochez-le après avoir contrôlé l’information sur un document officiel (Kbis, attestation d’assurance…)." onSave={() => saveSettingsAction("company", c)}>
      <div className="space-y-3">
        {(Object.keys(COMPANY_LABELS) as (keyof typeof COMPANY_LABELS)[]).map((k) => (
          <div key={k} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
            <TextInput label={COMPANY_LABELS[k]} value={c[k].value} maxLength={300} onChange={(e) => setC({ ...c, [k]: { ...c[k], value: e.target.value } })} />
            <div className="pb-2"><Toggle label="Vérifié" checked={c[k].verified} onChange={(verified) => setC({ ...c, [k]: { ...c[k], verified } })} /></div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AddressSection({ initial }: { initial: SiteSettings["address"] }) {
  const [a, setA] = useState(initial);
  return (
    <Section id="adresse" title="Adresse du siège" intro="Siège unique. Aucune agence n’est gérée." onSave={() => saveSettingsAction("address", a)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Rue" value={a.streetAddress} onChange={(e) => setA({ ...a, streetAddress: e.target.value })} />
        <TextInput label="Code postal" value={a.postalCode} onChange={(e) => setA({ ...a, postalCode: e.target.value })} />
        <TextInput label="Ville" value={a.addressLocality} onChange={(e) => setA({ ...a, addressLocality: e.target.value })} />
        <TextInput label="Région" value={a.addressRegion} onChange={(e) => setA({ ...a, addressRegion: e.target.value })} />
      </div>
      <Select label="Statut de l’adresse" value={a.source} onChange={(e) => setA({ ...a, source: e.target.value as typeof a.source })} options={[{ value: "user-supplied", label: "Fournie par le propriétaire (non vérifiée)" }, { value: "owner-verified", label: "Confirmée par le propriétaire" }]} />
      <Toggle label="Afficher l’adresse sur le site" checked={a.showOnSite} onChange={(showOnSite) => setA({ ...a, showOnSite })} />
    </Section>
  );
}

const MAILBOXES = ["contact", "devis", "projets", "direction", "privacy"] as const;
function EmailSection({ initial }: { initial: SiteSettings["emailRouting"] }) {
  const [r, setR] = useState(initial);
  return (
    <Section id="email" title="Adresses e-mail" intro="Ces adresses sont de la simple configuration tant que les boîtes n’existent pas. Cochez « provisionnée » seulement quand la boîte est créée et que l’enregistrement MX du domaine est vérifié." onSave={() => saveSettingsAction("emailRouting", r)}>
      {MAILBOXES.map((k) => (
        <div key={k} className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <TextInput label={`Adresse « ${k} »`} value={r[k].address} onChange={(e) => setR({ ...r, [k]: { ...r[k], address: e.target.value } })} />
          <div className="pb-2"><Toggle label={r[k].provisioned ? "Provisionnée" : "Non provisionnée"} checked={r[k].provisioned} onChange={(provisioned) => setR({ ...r, [k]: { ...r[k], provisioned } })} /></div>
        </div>
      ))}
      <Select label="Boîte recevant les nouvelles demandes" value={r.leadNotificationTarget} onChange={(e) => setR({ ...r, leadNotificationTarget: e.target.value as typeof r.leadNotificationTarget })} options={(["contact", "devis", "projets", "direction"] as const).map((k) => ({ value: k, label: `${k} (${r[k].address})` }))} />
    </Section>
  );
}

function MailSection({ initial, smtpEnv }: { initial: SiteSettings["mail"]; smtpEnv: boolean }) {
  const [m, setM] = useState(initial);
  return (
    <Section id="envoi-mail" title="Envoi des notifications e-mail" onSave={() => saveSettingsAction("mail", m)}>
      <Notice kind={smtpEnv ? "ok" : "warn"}>{smtpEnv ? "Les variables SMTP sont présentes sur le serveur." : "Les variables SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM) ne sont pas définies sur le serveur : aucun e-mail ne peut partir. Les demandes restent enregistrées dans l’administration."} Le mot de passe SMTP n’est jamais saisi ici ni enregistré en base : il se configure uniquement dans l’environnement du serveur.</Notice>
      <Toggle label="Activer l’envoi des notifications" checked={m.enabled} onChange={(enabled) => setM({ enabled })} hint="L’envoi n’a lieu que si cet interrupteur ET la configuration serveur sont en place." />
    </Section>
  );
}

function LeadsSection({ initial }: { initial: SiteSettings["leads"] }) {
  const [l, setL] = useState(initial);
  return (
    <Section id="demandes" title="Demandes de devis et données personnelles" intro="Durée de conservation indicative : 3 ans après le dernier contact (recommandation CNIL pour la prospection). À faire valider par le propriétaire / un conseil juridique." onSave={() => saveSettingsAction("leads", l)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Conservation (jours)" type="number" min={30} max={3650} value={l.retentionDays} onChange={(e) => setL({ ...l, retentionDays: Number(e.target.value) || 1095 })} />
        <TextInput label="Conservation des indésirables (jours)" type="number" min={1} max={365} value={l.spamRetentionDays} onChange={(e) => setL({ ...l, spamRetentionDays: Number(e.target.value) || 30 })} />
        <TextInput label="Version du texte de consentement" value={l.consentTextVersion} onChange={(e) => setL({ ...l, consentTextVersion: e.target.value })} />
      </div>
      <Toggle label="Durée de conservation validée" checked={l.retentionConfirmed} onChange={(retentionConfirmed) => setL({ ...l, retentionConfirmed })} />
      <Toggle label="Accepter les pièces jointes dans le formulaire" checked={l.attachmentsEnabled} onChange={(attachmentsEnabled) => setL({ ...l, attachmentsEnabled })} hint="JPEG, PNG, WebP ou PDF, 4 fichiers de 4 Mo maximum, stockés en privé." />
    </Section>
  );
}

function SeoSection({ initial }: { initial: SiteSettings["seo"] }) {
  const [s, setS] = useState(initial);
  return (
    <Section id="seo" title="Référencement global" onSave={() => saveSettingsAction("seo", s)}>
      <TextInput label="Jeton de vérification Google Search Console" value={s.googleSiteVerification} maxLength={200} onChange={(e) => setS({ ...s, googleSiteVerification: e.target.value })} help="Dans Search Console, choisissez la méthode « Balise HTML » et copiez uniquement la valeur de l’attribut content (lettres, chiffres, - et _)." />
      <TextArea label="Description par défaut" value={s.defaultMetaDescription} maxLength={300} counterMax={155} rows={2} onChange={(e) => setS({ ...s, defaultMetaDescription: e.target.value })} />
      <MediaField label="Image de partage par défaut" value={s.defaultOgImageId} onChange={(defaultOgImageId) => setS({ ...s, defaultOgImageId })} />
    </Section>
  );
}

function SocialSection({ initial }: { initial: SiteSettings["social"] }) {
  const [s, setS] = useState(initial);
  return (
    <Section id="reseaux" title="Réseaux sociaux" intro="URL https complètes, uniquement pour des comptes réellement existants et appartenant à l’entreprise." onSave={() => saveSettingsAction("social", s)}>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(s) as (keyof typeof s)[]).map((k) => <TextInput key={k} label={k} value={s[k]} placeholder="https://…" onChange={(e) => setS({ ...s, [k]: e.target.value })} />)}
      </div>
    </Section>
  );
}

function AnalyticsSection({ initial }: { initial: SiteSettings["analytics"] }) {
  const [a, setA] = useState(initial);
  return (
    <Section id="analytics" title="Mesure d’audience" onSave={() => saveSettingsAction("analytics", a)}>
      <Notice kind="warn">Désactivée par défaut. Aucun traceur ne doit se charger avant le consentement du visiteur (RGPD / CNIL). Google Analytics exige toujours un consentement ; l’activation ici ne charge rien tant que la bannière de consentement et la politique de sécurité (CSP) ne sont pas en place.</Notice>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Outil" value={a.provider} onChange={(e) => setA({ ...a, provider: e.target.value as typeof a.provider })} options={[{ value: "none", label: "Aucun" }, { value: "plausible", label: "Plausible" }, { value: "ga4", label: "Google Analytics 4" }]} />
        <TextInput label="Identifiant" value={a.id} onChange={(e) => setA({ ...a, id: e.target.value })} />
      </div>
      <Toggle label="Activé" checked={a.enabled} onChange={(enabled) => setA({ ...a, enabled })} />
      <Toggle label="Consentement requis" checked={a.requiresConsent || a.provider === "ga4"} disabled={a.provider === "ga4"} onChange={(requiresConsent) => setA({ ...a, requiresConsent })} />
    </Section>
  );
}

export function SettingsForms({ settings, smtpEnv }: { settings: SiteSettings; smtpEnv: boolean }) {
  return (
    <div className="space-y-8">
      <nav aria-label="Sections des réglages" className="flex flex-wrap gap-3 text-sm">
        {[["marque", "Marque / Logo"], ["entreprise", "Entreprise"], ["adresse", "Adresse"], ["email", "E-mails"], ["envoi-mail", "Envoi"], ["demandes", "Demandes"], ["seo", "SEO"], ["reseaux", "Réseaux"], ["analytics", "Audience"]].map(([id, l]) => <a key={id} href={`#${id}`} className="underline underline-offset-4">{l}</a>)}
      </nav>
      <BrandingSection initial={settings.branding} />
      <CompanySection initial={settings.company} />
      <AddressSection initial={settings.address} />
      <EmailSection initial={settings.emailRouting} />
      <MailSection initial={settings.mail} smtpEnv={smtpEnv} />
      <LeadsSection initial={settings.leads} />
      <SeoSection initial={settings.seo} />
      <SocialSection initial={settings.social} />
      <AnalyticsSection initial={settings.analytics} />
    </div>
  );
}
