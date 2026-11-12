"use client";
// Project editor (owner: cms-admin): gallery order (dnd + buttons), before/after pairs, placeholder warning.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { restoreProjectRevisionAction, saveProjectAction, softDeleteAction, unpublishAction } from "@/app/admin/(panel)/_actions/content";
import { REGIONS, REGION_NAMES } from "@/lib/cms/constants";
import { slugify } from "@/lib/content/paths";
import { BlockEditor, cleanBlocks, type BlockData } from "./BlockEditor";
import { MediaField, MediaListField, type MediaItem } from "./MediaPicker";
import { RevisionList, type RevisionRow } from "./RevisionList";
import { ErrorSummary, SeoPanel, StatusPanel, type SeoState, type StatusState } from "./SeoStatusPanels";
import { ActionButton, Card, Notice, Select, SubmitBar, TextArea, TextInput, btn, cx, useRunner, useUnsavedWarning } from "./ui";

export interface ProjectFormState {
  title: string;
  slug: string;
  summary: string;
  region: string;
  locationLabel: string;
  blocks: BlockData[];
  coverImageId: string | null;
  sortOrder: number;
  isPlaceholder: boolean;
  gallery: string[];
  pairs: { beforeId: string | null; afterId: string | null }[];
  status: StatusState;
  seo: SeoState;
}
export function ProjectEditor({ id, initial, initialMedia, revisions, preview, isLive }: { id?: string; initial: ProjectFormState; initialMedia: MediaItem[]; revisions: RevisionRow[]; preview?: string; isLive?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const { run, pending } = useRunner();
  useUnsavedWarning(dirty);
  const upd = (patch: Partial<ProjectFormState>) => {
    setS((c) => ({ ...c, ...patch }));
    setDirty(true);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFe({});
    const pairs = s.pairs.filter((p) => p.beforeId && p.afterId) as { beforeId: string; afterId: string }[];
    if (pairs.length !== s.pairs.length) {
      setError("Chaque paire avant / après doit contenir deux images.");
      return;
    }
    run(
      () =>
        saveProjectAction({
          id, title: s.title, slug: s.slug, summary: s.summary, region: s.region || null, locationLabel: s.locationLabel,
          blocks: cleanBlocks(s.blocks), coverImageId: s.coverImageId, sortOrder: s.sortOrder, isPlaceholder: s.isPlaceholder,
          gallery: s.gallery, pairs, status: s.status.status, scheduledAt: s.status.scheduledAt || null, ...s.seo,
        }),
      {
        refresh: false,
        onOk: (r) => {
          setDirty(false);
          if (!id && r.data) router.replace(`/admin/realisations/${r.data.id}`);
          else router.refresh();
        },
        onFail: (r) => {
          setError(r.error);
          setFe(r.fieldErrors ?? {});
        },
      },
    );
  }

  const setPair = (i: number, patch: Partial<{ beforeId: string | null; afterId: string | null }>) => upd({ pairs: s.pairs.map((p, k) => (k === i ? { ...p, ...patch } : p)) });
  const movePair = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= s.pairs.length) return;
    const next = [...s.pairs];
    [next[i], next[j]] = [next[j]!, next[i]!];
    upd({ pairs: next });
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <ErrorSummary error={error} fieldErrors={fe} />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card title="Réalisation">
            <div className="space-y-4">
              {s.isPlaceholder ? <Notice kind="warn"><strong>Contenu de démonstration.</strong> Cette réalisation sera présentée comme un exemple, jamais comme un chantier réel de BatiNova. Décochez la case dans « Publication » uniquement pour un vrai chantier dont vous détenez les photos.</Notice> : null}
              <TextInput label="Titre" required value={s.title} maxLength={160} error={fe.title} onChange={(e) => upd({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
              <TextInput label="Adresse (slug)" value={s.slug} onChange={(e) => { setSlugTouched(true); upd({ slug: e.target.value }); }} error={fe.slug} hint={`Adresse publique : /realisations/${slugify(s.slug) || "…"}`} help="Fin de l’adresse de la réalisation. Une redirection 301 est créée automatiquement si vous la changez après publication." />
              <TextArea label="Résumé" value={s.summary} maxLength={600} counterMax={600} rows={3} onChange={(e) => upd({ summary: e.target.value })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Région" value={s.region} onChange={(e) => upd({ region: e.target.value })} options={[{ value: "", label: "Non précisée" }, ...REGIONS.map((r) => ({ value: r, label: REGION_NAMES[r] }))]} />
                <TextInput label="Localisation (facultatif)" value={s.locationLabel} maxLength={120} placeholder="Saint-Lô (50)" onChange={(e) => upd({ locationLabel: e.target.value })} hint="À renseigner seulement si vérifié avec le client." />
              </div>
              <MediaField label="Image de couverture" value={s.coverImageId} onChange={(coverImageId) => upd({ coverImageId })} error={fe.coverImageId} />
            </div>
          </Card>
          <Card title="Galerie">
            <MediaListField label="Images de la galerie (ordre d’affichage)" values={s.gallery} max={60} onChange={(gallery) => upd({ gallery })} />
          </Card>
          <Card title="Avant / après">
            <div className="space-y-4">
              {s.pairs.map((p, i) => (
                <fieldset key={i} className="space-y-3 rounded-sm border border-charcoal/15 p-3">
                  <legend className="px-1 text-sm">Paire {i + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MediaField label="Avant" value={p.beforeId} onChange={(id2) => setPair(i, { beforeId: id2 })} />
                    <MediaField label="Après" value={p.afterId} onChange={(id2) => setPair(i, { afterId: id2 })} />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={cx(btn.secondary, btn.small)} disabled={i === 0} onClick={() => movePair(i, -1)} aria-label={`Monter la paire ${i + 1}`}>↑</button>
                    <button type="button" className={cx(btn.secondary, btn.small)} disabled={i === s.pairs.length - 1} onClick={() => movePair(i, 1)} aria-label={`Descendre la paire ${i + 1}`}>↓</button>
                    <button type="button" className={cx(btn.ghost, btn.small, "text-red-700")} onClick={() => upd({ pairs: s.pairs.filter((_, k) => k !== i) })}>Retirer la paire</button>
                  </div>
                </fieldset>
              ))}
              <button type="button" className={btn.secondary} disabled={s.pairs.length >= 20} onClick={() => upd({ pairs: [...s.pairs, { beforeId: null, afterId: null }] })}>Ajouter une paire avant / après</button>
            </div>
          </Card>
          <Card title="Contenu additionnel (blocs)">
            <BlockEditor blocks={s.blocks} onChange={(blocks) => upd({ blocks })} errors={Object.fromEntries(Object.entries(fe).filter(([k]) => k.startsWith("block:")))} initialMedia={initialMedia} />
          </Card>
        </div>
        <div className="space-y-6">
          <StatusPanel value={s.status} onChange={(status) => upd({ status })} errors={fe} isPlaceholder={s.isPlaceholder} onPlaceholder={(isPlaceholder) => upd({ isPlaceholder })} />
          <Card title="Ordre"><TextInput label="Priorité d’affichage" type="number" min={0} max={10000} value={s.sortOrder} onChange={(e) => upd({ sortOrder: Number(e.target.value) || 0 })} hint="Plus le nombre est petit, plus la réalisation apparaît tôt." /></Card>
          <SeoPanel value={s.seo} onChange={(seo) => upd({ seo })} errors={fe} publicPath={`/realisations/${slugify(s.slug) || slugify(s.title)}`} fallbackTitle={s.title} fallbackDescription={s.summary} />
          {id ? <RevisionList revisions={revisions} restore={(rid) => restoreProjectRevisionAction(id, rid)} /> : null}
        </div>
      </div>
      <SubmitBar pending={pending} dirty={dirty}>
        {id && preview ? <Link href={preview} target="_blank" className={btn.secondary}>Aperçu (privé)</Link> : null}
        {id && isLive ? <ActionButton size="normal" run={() => unpublishAction("project", id)} confirm={{ title: "Dépublier cette réalisation ?", message: "Elle repasse en brouillon.", confirmLabel: "Dépublier" }}>Dépublier</ActionButton> : null}
        {id ? <ActionButton size="normal" variant="danger" run={() => softDeleteAction("project", id)} onOk={() => router.push("/admin/realisations")} confirm={{ title: "Mettre cette réalisation à la corbeille ?", message: "Restauration possible depuis la corbeille.", confirmLabel: "Mettre à la corbeille", danger: true }}>Supprimer</ActionButton> : null}
      </SubmitBar>
    </form>
  );
}
