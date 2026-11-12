"use client";
import { useState } from "react";
import { saveCategoryAction, saveTagAction, softDeleteAction } from "@/app/admin/(panel)/_actions/content";
import { ActionButton, Card, TextArea, TextInput, btn, cx, useRunner } from "./ui";

interface Cat { id: string; name: string; slug: string; description: string; metaTitle: string; metaDescription: string; posts: number }
interface TagRow { id: string; name: string; slug: string; posts: number }

function CategoryForm({ cat, onDone }: { cat?: Cat; onDone?: () => void }) {
  const { run, pending } = useRunner();
  const [s, setS] = useState({ name: cat?.name ?? "", slug: cat?.slug ?? "", description: cat?.description ?? "", metaTitle: cat?.metaTitle ?? "", metaDescription: cat?.metaDescription ?? "" });
  const [fe, setFe] = useState<Record<string, string>>({});
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setFe({});
        run(() => saveCategoryAction({ id: cat?.id, ...s, noindex: false }), { onOk: () => { if (!cat) setS({ name: "", slug: "", description: "", metaTitle: "", metaDescription: "" }); onDone?.(); }, onFail: (r) => setFe(r.fieldErrors ?? {}) });
      }}
    >
      <TextInput label="Nom" required value={s.name} maxLength={80} error={fe.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      <TextInput label="Adresse (slug)" value={s.slug} error={fe.slug} onChange={(e) => setS({ ...s, slug: e.target.value })} hint="Vide = générée depuis le nom. Un changement crée une redirection 301." />
      <TextArea label="Description" value={s.description} maxLength={500} counterMax={500} rows={2} onChange={(e) => setS({ ...s, description: e.target.value })} />
      <TextInput label="Titre Google (facultatif)" value={s.metaTitle} counterMax={60} onChange={(e) => setS({ ...s, metaTitle: e.target.value })} />
      <TextArea label="Description Google (facultative)" value={s.metaDescription} counterMax={155} rows={2} onChange={(e) => setS({ ...s, metaDescription: e.target.value })} />
      <button className={btn.primary} disabled={pending} type="submit">{cat ? "Enregistrer" : "Créer la catégorie"}</button>
    </form>
  );
}

function TagForm({ tag }: { tag?: TagRow }) {
  const { run, pending } = useRunner();
  const [s, setS] = useState({ name: tag?.name ?? "", slug: tag?.slug ?? "" });
  const [fe, setFe] = useState<Record<string, string>>({});
  return (
    <form noValidate className={cx("flex flex-wrap items-end gap-2")} onSubmit={(e) => { e.preventDefault(); setFe({}); run(() => saveTagAction({ id: tag?.id, ...s }), { onOk: () => !tag && setS({ name: "", slug: "" }), onFail: (r) => setFe(r.fieldErrors ?? {}) }); }}>
      <TextInput label="Nom" value={s.name} maxLength={40} error={fe.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
      <TextInput label="Adresse" value={s.slug} error={fe.slug} onChange={(e) => setS({ ...s, slug: e.target.value })} />
      <button className={btn.primary} disabled={pending} type="submit">{tag ? "Enregistrer" : "Créer"}</button>
    </form>
  );
}

export function TaxonomyManager({ categories, tags }: { categories: Cat[]; tags: TagRow[] }) {
  const [editCat, setEditCat] = useState<string | null>(null);
  const [editTag, setEditTag] = useState<string | null>(null);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Catégories">
        <ul className="mb-6 divide-y divide-charcoal/10">
          {categories.map((c) => (
            <li key={c.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><strong>{c.name}</strong> <span className="font-mono text-xs text-charcoal/60">/blog/categorie/{c.slug}</span> <span className="text-xs">({c.posts} article{c.posts > 1 ? "s" : ""})</span></span>
                <span className="flex gap-2">
                  <button type="button" className={btn.secondary + " " + btn.small} aria-expanded={editCat === c.id} onClick={() => setEditCat(editCat === c.id ? null : c.id)}>Modifier</button>
                  <ActionButton variant="danger" run={() => softDeleteAction("category", c.id)} confirm={{ title: `Supprimer la catégorie « ${c.name} » ?`, message: "Les articles restent mais n’ont plus de catégorie. Restauration possible depuis la corbeille.", confirmLabel: "Mettre à la corbeille", danger: true }}>Supprimer</ActionButton>
                </span>
              </div>
              {editCat === c.id ? <div className="mt-3"><CategoryForm cat={c} onDone={() => setEditCat(null)} /></div> : null}
            </li>
          ))}
          {categories.length === 0 ? <li className="py-3 text-sm text-charcoal/70">Aucune catégorie.</li> : null}
        </ul>
        <h3 className="mb-2 font-medium">Nouvelle catégorie</h3>
        <CategoryForm />
      </Card>
      <Card title="Étiquettes">
        <ul className="mb-6 divide-y divide-charcoal/10">
          {tags.map((t) => (
            <li key={t.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><strong>{t.name}</strong> <span className="font-mono text-xs text-charcoal/60">/blog/etiquette/{t.slug}</span> <span className="text-xs">({t.posts})</span></span>
                <span className="flex gap-2">
                  <button type="button" className={btn.secondary + " " + btn.small} aria-expanded={editTag === t.id} onClick={() => setEditTag(editTag === t.id ? null : t.id)}>Modifier</button>
                  <ActionButton variant="danger" run={() => softDeleteAction("tag", t.id)} confirm={{ title: `Supprimer l’étiquette « ${t.name} » ?`, confirmLabel: "Mettre à la corbeille", danger: true }}>Supprimer</ActionButton>
                </span>
              </div>
              {editTag === t.id ? <div className="mt-3"><TagForm tag={t} /></div> : null}
            </li>
          ))}
          {tags.length === 0 ? <li className="py-3 text-sm text-charcoal/70">Aucune étiquette. Elles se créent aussi directement depuis un article.</li> : null}
        </ul>
        <h3 className="mb-2 font-medium">Nouvelle étiquette</h3>
        <TagForm />
      </Card>
    </div>
  );
}
