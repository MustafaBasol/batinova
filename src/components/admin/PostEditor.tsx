"use client";
// Blog post editor (owner: cms-admin).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent, type KeyboardEvent } from "react";
import { restorePostRevisionAction, savePostAction, softDeleteAction, unpublishAction } from "@/app/admin/(panel)/_actions/content";
import { slugify } from "@/lib/content/paths";
import { MediaField, type MediaItem } from "./MediaPicker";
import { RichTextEditor, type RichDoc } from "./editor/RichTextEditor";
import { RevisionList, type RevisionRow } from "./RevisionList";
import { ErrorSummary, SeoPanel, StatusPanel, type SeoState, type StatusState } from "./SeoStatusPanels";
import { ActionButton, Card, Select, SubmitBar, TextArea, TextInput, btn, cx, inputCls, useRunner, useUnsavedWarning } from "./ui";

export interface PostFormState {
  title: string;
  slug: string;
  excerpt: string;
  body: RichDoc;
  coverImageId: string | null;
  categoryId: string | null;
  tags: string[];
  authorDisplayName: string;
  isPlaceholder: boolean;
  status: StatusState;
  seo: SeoState;
}
export function PostEditor({ id, initial, initialMedia, categories, allTags, revisions, preview, isLive }: { id?: string; initial: PostFormState; initialMedia: MediaItem[]; categories: { id: string; name: string }[]; allTags: string[]; revisions: RevisionRow[]; preview?: string; isLive?: boolean }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fe, setFe] = useState<Record<string, string>>({});
  const { run, pending } = useRunner();
  useUnsavedWarning(dirty);
  const upd = (patch: Partial<PostFormState>) => {
    setS((c) => ({ ...c, ...patch }));
    setDirty(true);
  };
  const addTag = () => {
    const t = tagDraft.trim();
    if (t && !s.tags.some((x) => slugify(x) === slugify(t)) && s.tags.length < 12) upd({ tags: [...s.tags, t] });
    setTagDraft("");
  };
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFe({});
    run(
      () =>
        savePostAction({
          id, title: s.title, slug: s.slug, excerpt: s.excerpt, body: s.body, coverImageId: s.coverImageId, categoryId: s.categoryId,
          tags: s.tags, authorDisplayName: s.authorDisplayName, isPlaceholder: s.isPlaceholder,
          status: s.status.status, scheduledAt: s.status.scheduledAt || null, ...s.seo,
        }),
      {
        refresh: false,
        onOk: (r) => {
          setDirty(false);
          if (!id && r.data) router.replace(`/admin/articles/${r.data.id}`);
          else router.refresh();
        },
        onFail: (r) => {
          setError(r.error);
          setFe(r.fieldErrors ?? {});
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <ErrorSummary error={error} fieldErrors={fe} />
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          <Card title="Article">
            <div className="space-y-4">
              <TextInput label="Titre de l’article (H1)" required value={s.title} maxLength={160} error={fe.title} onChange={(e) => upd({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) })} />
              <TextInput
                label="Adresse (slug)"
                value={s.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  upd({ slug: e.target.value });
                }}
                error={fe.slug}
                hint={`Adresse publique : /blog/${slugify(s.slug) || "…"}`}
                help="Fin de l’adresse de l’article. Laissez vide pour la générer depuis le titre. Si vous la modifiez après publication, une redirection 301 est créée automatiquement."
              />
              <TextArea label="Résumé (chapô)" value={s.excerpt} maxLength={400} counterMax={400} rows={3} onChange={(e) => upd({ excerpt: e.target.value })} hint="Affiché dans les listes d’articles et utilisé si la meta description est vide." />
            </div>
          </Card>
          <Card title="Rédaction">
            {fe.body ? <p role="alert" className="mb-2 text-sm text-red-700">{fe.body}</p> : null}
            <RichTextEditor id="post-body" label="Contenu de l’article" value={s.body} initialMedia={initialMedia} onChange={(body) => upd({ body })} />
            <p className="mt-2 text-xs text-charcoal/60">Le titre de l’article est le titre principal (H1) : utilisez H2 à H4 dans le texte.</p>
          </Card>
        </div>
        <div className="space-y-6">
          <StatusPanel value={s.status} onChange={(status) => upd({ status })} errors={fe} isPlaceholder={s.isPlaceholder} onPlaceholder={(isPlaceholder) => upd({ isPlaceholder })} />
          <Card title="Image et classement">
            <div className="space-y-4">
              <MediaField label="Image de couverture" value={s.coverImageId} onChange={(coverImageId) => upd({ coverImageId })} error={fe.coverImageId} hint="Requise pour publier, avec un texte alternatif décrivant l’image." />
              <Select label="Catégorie" value={s.categoryId ?? ""} onChange={(e) => upd({ categoryId: e.target.value || null })} options={[{ value: "", label: "Sans catégorie" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]} />
              <div className="space-y-1">
                <label htmlFor="tag-input" className="text-sm font-medium">Étiquettes</label>
                <ul className="flex flex-wrap gap-1.5">
                  {s.tags.map((t) => (
                    <li key={t} className="inline-flex items-center gap-1 rounded-full bg-beige/30 px-2.5 py-0.5 text-xs">
                      {t}
                      <button type="button" aria-label={`Retirer l’étiquette ${t}`} className="font-bold" onClick={() => upd({ tags: s.tags.filter((x) => x !== t) })}>×</button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <input id="tag-input" list="tag-list" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={onTagKey} placeholder="Ajouter (Entrée)" className={cx(inputCls)} maxLength={40} />
                  <button type="button" className={btn.secondary} onClick={addTag}>Ajouter</button>
                </div>
                <datalist id="tag-list">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
                <p className="text-xs text-charcoal/60">Une étiquette inconnue est créée automatiquement.</p>
              </div>
              <TextInput label="Nom d’auteur affiché" value={s.authorDisplayName} maxLength={80} onChange={(e) => upd({ authorDisplayName: e.target.value })} hint="Facultatif. Évitez les noms de personnes non vérifiés ; « L’équipe BatiNova » convient." />
            </div>
          </Card>
          <SeoPanel value={s.seo} onChange={(seo) => upd({ seo })} errors={fe} publicPath={`/blog/${slugify(s.slug) || slugify(s.title)}`} fallbackTitle={s.title} fallbackDescription={s.excerpt} />
          {id ? <RevisionList revisions={revisions} restore={(rid) => restorePostRevisionAction(id, rid)} /> : null}
        </div>
      </div>
      <SubmitBar pending={pending} dirty={dirty}>
        {id && preview ? <Link href={preview} target="_blank" className={btn.secondary}>Aperçu (privé)</Link> : null}
        {id && isLive ? <ActionButton size="normal" run={() => unpublishAction("post", id)} confirm={{ title: "Dépublier cet article ?", message: "Il repasse en brouillon et n’est plus visible sur le site.", confirmLabel: "Dépublier" }}>Dépublier</ActionButton> : null}
        {id ? <ActionButton size="normal" variant="danger" run={() => softDeleteAction("post", id)} onOk={() => router.push("/admin/articles")} confirm={{ title: "Mettre cet article à la corbeille ?", message: "Il disparaît du site. Restauration possible depuis la corbeille.", confirmLabel: "Mettre à la corbeille", danger: true }}>Supprimer</ActionButton> : null}
      </SubmitBar>
    </form>
  );
}
