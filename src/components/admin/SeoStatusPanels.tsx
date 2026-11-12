"use client";
// SEO + publication panels shared by page/post/project editors (owner: cms-admin).
import { SITE_URL } from "@/lib/config/site";
import { CONTENT_STATUSES, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, STATUS_LABELS, type ContentStatusKey } from "@/lib/cms/constants";
import { MediaField } from "./MediaPicker";
import { Card, Notice, Select, TextArea, TextInput, Toggle, cx } from "./ui";

export interface SeoState {
  metaTitle: string;
  metaDescription: string;
  ogImageId: string | null;
  noindex: boolean;
  canonicalPath: string;
}
export const emptySeo = (): SeoState => ({ metaTitle: "", metaDescription: "", ogImageId: null, noindex: false, canonicalPath: "" });

export function SeoPanel({
  value,
  onChange,
  errors = {},
  publicPath,
  fallbackTitle,
  fallbackDescription,
}: {
  value: SeoState;
  onChange: (v: SeoState) => void;
  errors?: Record<string, string>;
  publicPath: string;
  fallbackTitle: string;
  fallbackDescription?: string;
}) {
  const set = <K extends keyof SeoState>(k: K, v: SeoState[K]) => onChange({ ...value, [k]: v });
  const shownTitle = value.metaTitle.trim() || fallbackTitle || "Titre de la page";
  const shownDesc = value.metaDescription.trim() || fallbackDescription || "Sans description, Google choisira un extrait du contenu de la page.";
  const crumbs = (SITE_URL.replace(/^https?:\/\//, "") + (publicPath === "/" ? "" : publicPath)).split("/").filter(Boolean).join(" › ");
  return (
    <Card title="Référencement (SEO)">
      <div className="space-y-4">
        <div aria-label="Aperçu dans Google" className="rounded-sm border border-charcoal/15 bg-offwhite p-4">
          <p className="mb-2 text-xs uppercase tracking-wide text-charcoal/60">Aperçu dans les résultats Google (indicatif)</p>
          <p className="truncate text-xs text-charcoal/70">{crumbs}</p>
          <p className="truncate text-lg text-[#1a0dab]">{shownTitle.slice(0, 70)}</p>
          <p className="line-clamp-2 text-sm text-charcoal/80">{shownDesc.slice(0, 170)}</p>
        </div>
        <TextInput
          label="Titre affiché dans Google (meta title)"
          value={value.metaTitle}
          onChange={(e) => set("metaTitle", e.target.value)}
          counterMax={SEO_TITLE_MAX}
          placeholder={fallbackTitle}
          error={errors.metaTitle}
          help="C’est le titre bleu cliquable dans les résultats de recherche. Laissez vide pour utiliser le titre de la page. Environ 60 caractères sont affichés."
          hint="Décrivez la page en quelques mots clairs, sans bourrage de mots-clés."
        />
        <TextArea
          label="Description (meta description)"
          value={value.metaDescription}
          onChange={(e) => set("metaDescription", e.target.value)}
          counterMax={SEO_DESCRIPTION_MAX}
          rows={3}
          error={errors.metaDescription}
          help="Le petit texte sous le titre dans Google. Il n’améliore pas directement le classement mais donne envie de cliquer. Environ 155 caractères sont affichés."
        />
        <MediaField label="Image de partage (réseaux sociaux)" value={value.ogImageId} onChange={(id) => set("ogImageId", id)} hint="Affichée quand la page est partagée sur LinkedIn, Facebook… Laissez vide pour l’image par défaut." error={errors.ogImageId} />
        <details className="rounded-sm border border-charcoal/15 p-3">
          <summary className="cursor-pointer text-sm font-medium">Options avancées</summary>
          <div className="mt-3 space-y-4">
            <Toggle
              label="Ne pas indexer cette page (noindex)"
              checked={value.noindex}
              onChange={(v) => set("noindex", v)}
              help="Demande aux moteurs de recherche de ne pas afficher cette page dans leurs résultats. Utile pour une page de test ou confidentielle. La page reste accessible à qui connaît l’adresse."
            />
            <TextInput
              label="Adresse canonique"
              value={value.canonicalPath}
              onChange={(e) => set("canonicalPath", e.target.value)}
              placeholder="/chemin-de-la-page-principale"
              error={errors.canonicalPath}
              help="À remplir seulement si cette page est un doublon d’une autre : indiquez l’adresse de la page « officielle » pour éviter la dilution du référencement. Laissez vide dans le cas général."
            />
          </div>
        </details>
      </div>
    </Card>
  );
}

export interface StatusState {
  status: ContentStatusKey;
  scheduledAt: string; // "YYYY-MM-DDTHH:mm" Europe/Paris
}

export function StatusPanel({ value, onChange, errors = {}, isPlaceholder, onPlaceholder }: { value: StatusState; onChange: (v: StatusState) => void; errors?: Record<string, string>; isPlaceholder: boolean; onPlaceholder: (v: boolean) => void }) {
  return (
    <Card title="Publication">
      <div className="space-y-4">
        <Select
          label="État"
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value as ContentStatusKey })}
          options={CONTENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          help="Brouillon : visible uniquement ici. Programmé : publié automatiquement à la date choisie. Publié : visible par tous. Archivé : retiré du site sans être supprimé."
        />
        {value.status === "SCHEDULED" ? (
          <div className="space-y-1">
            <TextInput
              label="Date et heure de publication (heure de Paris)"
              type="datetime-local"
              value={value.scheduledAt}
              onChange={(e) => onChange({ ...value, scheduledAt: e.target.value })}
              error={errors.scheduledAt}
              required
            />
          </div>
        ) : null}
        {value.status === "PUBLISHED" ? <p className="text-xs text-charcoal/70">En enregistrant, le contenu devient public immédiatement. Chaque image utilisée doit avoir un texte alternatif.</p> : null}
        {errors.media ? <p role="alert" className="text-xs text-red-700">{errors.media}</p> : null}
        <Toggle
          label="Contenu de démonstration"
          checked={isPlaceholder}
          onChange={onPlaceholder}
          help="Cochez si le texte ou les images sont des exemples et non de vrais éléments de l’entreprise. Le site affichera alors la mention « Contenu de démonstration »."
        />
        {isPlaceholder ? <Notice kind="warn">Ce contenu sera présenté comme une démonstration. Décochez uniquement lorsque le texte et les images sont réels et vérifiés.</Notice> : null}
      </div>
    </Card>
  );
}

export function ErrorSummary({ error, fieldErrors }: { error: string | null; fieldErrors?: Record<string, string> }) {
  if (!error) return null;
  const extra = Object.entries(fieldErrors ?? {}).filter(([k]) => k.startsWith("block:") || k === "body");
  return (
    <div role="alert" className={cx("rounded-sm border border-red-700/40 bg-red-50 p-3 text-sm text-red-900")}>
      <p className="font-medium">{error}</p>
      {extra.length ? (
        <ul className="mt-1 list-disc pl-5 text-xs">
          {extra.map(([k, v]) => (
            <li key={k}>{k.startsWith("block:") ? `Bloc n°${Number(k.slice(6)) + 1} — ${v}` : v}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
