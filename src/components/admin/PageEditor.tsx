"use client";
// Page editor (owner: cms-admin).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { duplicatePageAction, restorePageRevisionAction, savePageAction, softDeleteAction } from "@/app/admin/(panel)/_actions/content";
import { slugify } from "@/lib/content/paths";
import { PAGE_TEMPLATES, TEMPLATE_LABELS, TEMPLATE_PREFIX, type PageTemplateKey } from "@/lib/cms/constants";
import { BlockEditor, cleanBlocks, type BlockData } from "./BlockEditor";
import type { MediaItem } from "./MediaPicker";
import { ErrorSummary, SeoPanel, StatusPanel, type SeoState, type StatusState } from "./SeoStatusPanels";
import { ActionButton, Card, Select, SubmitBar, TextInput, Toggle, useRunner, useUnsavedWarning, btn } from "./ui";
import { RevisionList, type RevisionRow } from "./RevisionList";

export interface PageFormState {
  title: string;
  path: string;
  template: PageTemplateKey;
  blocks: BlockData[];
  showInNav: boolean;
  navOrder: number;
  navLabel: string;
  parentId: string | null;
  isPlaceholder: boolean;
  status: StatusState;
  seo: SeoState;
}

export function PageEditor({ id, initial, initialMedia, parents, revisions, preview }: { id?: string; initial: PageFormState; initialMedia: MediaItem[]; parents: { id: string; title: string; path: string }[]; revisions: RevisionRow[]; preview?: string }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [pathTouched, setPathTouched] = useState(!!id);
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const { run, pending } = useRunner();
  useUnsavedWarning(dirty);
  const upd = (patch: Partial<PageFormState>) => {
    setS((cur) => ({ ...cur, ...patch }));
    setDirty(true);
  };
  const isHome = s.template === "HOME";

  function onTitle(title: string) {
    const patch: Partial<PageFormState> = { title };
    if (!pathTouched && !isHome) patch.path = `${TEMPLATE_PREFIX[s.template] ?? ""}${slugify(title)}`;
    upd(patch);
  }
  function onTemplate(template: PageTemplateKey) {
    const patch: Partial<PageFormState> = { template };
    if (!pathTouched) patch.path = template === "HOME" ? "" : `${TEMPLATE_PREFIX[template] ?? ""}${slugify(s.title)}`;
    upd(patch);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFe({});
    run(
      () =>
        savePageAction({
          id,
          title: s.title,
          path: s.path,
          template: s.template,
          blocks: cleanBlocks(s.blocks),
          showInNav: s.showInNav,
          navOrder: s.navOrder,
          navLabel: s.navLabel,
          parentId: s.parentId,
          isPlaceholder: s.isPlaceholder,
          status: s.status.status,
          scheduledAt: s.status.scheduledAt || null,
          ...s.seo,
        }),
      {
        refresh: false,
        onOk: (r) => {
          setDirty(false);
          if (!id && r.data) router.replace(`/admin/pages/${r.data.id}`);
          else router.refresh();
        },
        onFail: (r) => {
          setError(r.error);
          setFe(r.fieldErrors ?? {});
        },
      },
    );
  }

  const blockErrors = Object.fromEntries(Object.entries(fe).filter(([k]) => k.startsWith("block:")));
  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <ErrorSummary error={error} />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card title="Page">
            <div className="space-y-4">
              <TextInput label="Titre de la page" required value={s.title} maxLength={160} onChange={(e) => onTitle(e.target.value)} error={fe.title} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Modèle" value={s.template} onChange={(e) => onTemplate(e.target.value as PageTemplateKey)} options={PAGE_TEMPLATES.map((t) => ({ value: t, label: TEMPLATE_LABELS[t] }))} help="Le modèle indique le type de page : un service, une zone d’intervention, une page légale… L’accueil est unique." />
                <TextInput
                  label="Adresse de la page (slug)"
                  value={isHome ? "" : s.path}
                  disabled={isHome}
                  onChange={(e) => {
                    setPathTouched(true);
                    upd({ path: e.target.value });
                  }}
                  placeholder={isHome ? "(page d’accueil : /)" : "services/renovation"}
                  error={fe.path}
                  help="La partie de l’adresse après btnv.fr/. Minuscules, chiffres et tirets ; les accents sont retirés automatiquement. Changer l’adresse d’une page publiée crée une redirection 301 automatique depuis l’ancienne adresse."
                  hint={isHome ? "La page d’accueil est servie à la racine du site." : `Adresse publique : /${s.path}`}
                />
              </div>
            </div>
          </Card>
          <Card title="Contenu (blocs)">
            <BlockEditor blocks={s.blocks} onChange={(blocks) => upd({ blocks })} errors={blockErrors} initialMedia={initialMedia} />
          </Card>
        </div>
        <div className="space-y-6">
          <StatusPanel value={s.status} onChange={(status) => upd({ status })} errors={fe} isPlaceholder={s.isPlaceholder} onPlaceholder={(isPlaceholder) => upd({ isPlaceholder })} />
          <Card title="Menu et hiérarchie">
            <div className="space-y-4">
              <Select label="Page parente" value={s.parentId ?? ""} onChange={(e) => upd({ parentId: e.target.value || null })} options={[{ value: "", label: "Aucune" }, ...parents.filter((p) => p.id !== id).map((p) => ({ value: p.id, label: `${p.title} (/${p.path})` }))]} error={fe.parentId} />
              <Toggle label="Afficher dans le menu (repli)" checked={s.showInNav} onChange={(showInNav) => upd({ showInNav })} help="Utilisé seulement si aucun élément n’est défini dans « Navigation ». Préférez gérer le menu depuis la page Navigation." />
              <TextInput label="Libellé dans le menu" value={s.navLabel} maxLength={60} onChange={(e) => upd({ navLabel: e.target.value })} />
            </div>
          </Card>
          <SeoPanel value={s.seo} onChange={(seo) => upd({ seo })} errors={fe} publicPath={s.path ? `/${s.path}` : "/"} fallbackTitle={s.title} />
          {id ? <RevisionList revisions={revisions} restore={(rid) => restorePageRevisionAction(id, rid)} /> : null}
        </div>
      </div>
      <SubmitBar pending={pending} dirty={dirty}>
        {id && preview ? <Link href={preview} target="_blank" className={btn.secondary}>Aperçu (privé)</Link> : null}
        {id ? <ActionButton size="normal" run={() => duplicatePageAction(id)}>Dupliquer</ActionButton> : null}
        {id ? <ActionButton size="normal" variant="danger" run={() => softDeleteAction("page", id)} onOk={() => router.push("/admin/pages")} confirm={{ title: "Mettre cette page à la corbeille ?", message: "Elle disparaît du site immédiatement. Vous pourrez la restaurer depuis la corbeille.", confirmLabel: "Mettre à la corbeille", danger: true }}>Supprimer</ActionButton> : null}
      </SubmitBar>
    </form>
  );
}
