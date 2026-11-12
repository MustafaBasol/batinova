"use client";
// Constrained block editor (owner: cms-admin): only block types from src/lib/blocks/schema.ts.
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { BLOCK_TYPES, type CmsBlockType } from "@/lib/blocks/schema";
import { REGIONS, REGION_NAMES } from "@/lib/cms/constants";
import { MediaField, MediaListField, type MediaItem } from "./MediaPicker";
import { RichTextEditor, type RichDoc } from "./editor/RichTextEditor";
import { Select, TextArea, TextInput, btn, cx, useConfirm } from "./ui";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BlockData = { type: CmsBlockType; id?: string } & Record<string, any>;

const rid = () => `b${Math.random().toString(36).slice(2, 10)}`;
export const withIds = (blocks: BlockData[]): BlockData[] => blocks.map((b) => (b.id ? b : { ...b, id: rid() }));

export function BlockEditor({ blocks, onChange, errors = {}, initialMedia = [] }: { blocks: BlockData[]; onChange: (b: BlockData[]) => void; errors?: Record<string, string>; initialMedia?: MediaItem[] }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [adding, setAdding] = useState<CmsBlockType>("richText");
  const ask = useConfirm();
  const ids = blocks.map((b) => b.id!);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j >= 0 && j < blocks.length) onChange(arrayMove(blocks, i, j));
  };
  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    onChange(arrayMove(blocks, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))));
  }

  return (
    <div className="space-y-3">
      {blocks.length === 0 ? <p className="rounded-sm border border-dashed border-charcoal/30 p-6 text-center text-sm text-charcoal/70">Cette page est vide. Ajoutez un premier bloc ci-dessous.</p> : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol className="space-y-3">
            {blocks.map((b, i) => (
              <SortableBlock
                key={b.id}
                block={b}
                index={i}
                total={blocks.length}
                error={errors[`block:${i}`]}
                initialMedia={initialMedia}
                onMove={(d) => move(i, d)}
                onRemove={async () => {
                  if (await ask({ title: "Supprimer ce bloc ?", message: `Le bloc « ${BLOCK_TYPES[b.type].label} » sera retiré de la page (annulable tant que vous n’enregistrez pas).`, confirmLabel: "Supprimer le bloc", danger: true }))
                    onChange(blocks.filter((_, k) => k !== i));
                }}
                onChange={(nb) => onChange(blocks.map((x, k) => (k === i ? nb : x)))}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      <div className="flex flex-wrap items-end gap-2 rounded-sm border border-charcoal/15 bg-offwhite p-3">
        <div className="min-w-56 flex-1">
          <Select
            label="Ajouter un bloc"
            value={adding}
            onChange={(e) => setAdding(e.target.value as CmsBlockType)}
            options={(Object.keys(BLOCK_TYPES) as CmsBlockType[]).map((t) => ({ value: t, label: `${BLOCK_TYPES[t].label} — ${BLOCK_TYPES[t].description}` }))}
          />
        </div>
        <button type="button" className={btn.primary} onClick={() => onChange([...blocks, { ...structuredClone(BLOCK_TYPES[adding].defaults), id: rid() } as BlockData])}>
          Ajouter
        </button>
      </div>
    </div>
  );
}

function SortableBlock({ block, index, total, error, initialMedia, onMove, onRemove, onChange }: { block: BlockData; index: number; total: number; error?: string; initialMedia: MediaItem[]; onMove: (d: -1 | 1) => void; onRemove: () => void; onChange: (b: BlockData) => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id! });
  const [open, setOpen] = useState(true);
  const meta = BLOCK_TYPES[block.type];
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx("rounded-sm border bg-white", error ? "border-red-700" : "border-charcoal/20", isDragging && "opacity-70 shadow-lg")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-charcoal/10 px-3 py-2">
        <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={`Déplacer le bloc ${index + 1} (${meta.label}) : glisser ou utiliser les flèches du clavier`} className="cursor-grab rounded-sm border border-charcoal/30 px-2 py-1 text-sm touch-none">⠿</button>
        <span className="text-xs text-charcoal/60">{index + 1}.</span>
        <h3 className="flex-1 text-sm font-medium">{meta.label}</h3>
        <button type="button" className={cx(btn.secondary, btn.small)} aria-label={`Monter le bloc ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className={cx(btn.secondary, btn.small)} aria-label={`Descendre le bloc ${index + 1}`} disabled={index === total - 1} onClick={() => onMove(1)}>↓</button>
        <button type="button" className={cx(btn.secondary, btn.small)} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Replier" : "Déplier"}</button>
        <button type="button" className={cx(btn.ghost, btn.small, "text-red-700")} onClick={onRemove}>Supprimer</button>
      </div>
      {error ? <p role="alert" className="border-b border-red-700/30 bg-red-50 px-3 py-2 text-xs text-red-900">{error}</p> : null}
      <div className={cx("space-y-4 p-4", !open && "hidden")}>
        <BlockForm block={block} onChange={onChange} initialMedia={initialMedia} />
      </div>
    </li>
  );
}

function ItemsEditor({ items, onChange, fields, noun }: { items: Record<string, string>[]; onChange: (i: Record<string, string>[]) => void; fields: { key: string; label: string; area?: boolean; max: number }[]; noun: string }) {
  const swap = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    onChange(arrayMove(items, i, j));
  };
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <fieldset key={i} className="space-y-2 rounded-sm border border-charcoal/15 p-3">
          <legend className="px-1 text-xs text-charcoal/70">{noun} {i + 1}</legend>
          {fields.map((f) =>
            f.area ? (
              <TextArea key={f.key} label={f.label} value={it[f.key] ?? ""} maxLength={f.max} counterMax={f.max} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, [f.key]: e.target.value } : x)))} />
            ) : (
              <TextInput key={f.key} label={f.label} value={it[f.key] ?? ""} maxLength={f.max} onChange={(e) => onChange(items.map((x, k) => (k === i ? { ...x, [f.key]: e.target.value } : x)))} />
            ),
          )}
          <div className="flex gap-2">
            <button type="button" className={cx(btn.secondary, btn.small)} disabled={i === 0} onClick={() => swap(i, -1)} aria-label={`Monter ${noun} ${i + 1}`}>↑</button>
            <button type="button" className={cx(btn.secondary, btn.small)} disabled={i === items.length - 1} onClick={() => swap(i, 1)} aria-label={`Descendre ${noun} ${i + 1}`}>↓</button>
            <button type="button" className={cx(btn.ghost, btn.small, "text-red-700")} onClick={() => onChange(items.filter((_, k) => k !== i))}>Retirer</button>
          </div>
        </fieldset>
      ))}
      <button type="button" className={btn.secondary} onClick={() => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, ""]))])}>Ajouter {noun === "Question" ? "une question" : "un élément"}</button>
    </div>
  );
}

function BlockForm({ block, onChange, initialMedia }: { block: BlockData; onChange: (b: BlockData) => void; initialMedia: MediaItem[] }) {
  const set = (patch: Record<string, unknown>) => onChange({ ...block, ...patch });
  const str = (k: string) => (typeof block[k] === "string" ? (block[k] as string) : "");
  const heading = <TextInput label="Titre de la section (facultatif)" value={str("heading")} maxLength={160} onChange={(e) => set({ heading: e.target.value })} />;
  switch (block.type) {
    case "hero":
      return (
        <>
          <TextInput label="Sur-titre (facultatif)" value={str("eyebrow")} maxLength={80} onChange={(e) => set({ eyebrow: e.target.value })} />
          <TextInput label="Titre principal" required value={str("heading")} maxLength={160} onChange={(e) => set({ heading: e.target.value })} />
          <TextArea label="Sous-titre (facultatif)" value={str("subheading")} maxLength={400} counterMax={400} onChange={(e) => set({ subheading: e.target.value })} />
          <MediaField label="Image" value={block.imageId} onChange={(id) => set({ imageId: id ?? undefined })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Texte du bouton" value={str("ctaLabel")} maxLength={60} onChange={(e) => set({ ctaLabel: e.target.value })} />
            <TextInput label="Lien du bouton" value={str("ctaHref")} placeholder="/contact" hint="Chemin du site (/contact), https://…, mailto: ou tel:" onChange={(e) => set({ ctaHref: e.target.value })} />
          </div>
        </>
      );
    case "richText":
      return <RichTextEditor id={`rt-${block.id}`} label="Texte" value={block.doc as RichDoc} initialMedia={initialMedia} onChange={(doc) => set({ doc })} />;
    case "image":
      return (
        <>
          <MediaField label="Image" value={block.mediaId || null} onChange={(id) => set({ mediaId: id ?? "" })} />
          <TextInput label="Légende (facultative)" value={str("caption")} maxLength={300} onChange={(e) => set({ caption: e.target.value })} />
        </>
      );
    case "gallery":
      return (
        <>
          {heading}
          <MediaListField label="Images de la galerie" values={(block.mediaIds as string[]) ?? []} onChange={(ids) => set({ mediaIds: ids })} />
        </>
      );
    case "ctaBand":
      return (
        <>
          <TextInput label="Titre" required value={str("heading")} maxLength={160} onChange={(e) => set({ heading: e.target.value })} />
          <TextArea label="Texte (facultatif)" value={str("text")} maxLength={400} counterMax={400} onChange={(e) => set({ text: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Texte du bouton" required value={str("label")} maxLength={60} onChange={(e) => set({ label: e.target.value })} />
            <TextInput label="Lien du bouton" required value={str("href")} placeholder="/contact" onChange={(e) => set({ href: e.target.value })} />
          </div>
        </>
      );
    case "features":
    case "steps":
      return (
        <>
          {heading}
          <ItemsEditor items={(block.items as Record<string, string>[]) ?? []} onChange={(items) => set({ items })} noun={block.type === "steps" ? "Étape" : "Point fort"} fields={[{ key: "title", label: "Titre", max: 120 }, { key: "text", label: "Texte (texte simple)", area: true, max: 1500 }]} />
        </>
      );
    case "faq":
      return (
        <>
          {heading}
          <ItemsEditor items={(block.items as Record<string, string>[]) ?? []} onChange={(items) => set({ items })} noun="Question" fields={[{ key: "question", label: "Question", max: 300 }, { key: "answer", label: "Réponse (texte simple)", area: true, max: 3000 }]} />
        </>
      );
    case "projectsGrid":
      return (
        <>
          {heading}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Nombre de réalisations" type="number" min={1} max={24} value={block.limit ?? 6} onChange={(e) => set({ limit: Number(e.target.value) || 6 })} />
            <Select label="Région" value={block.region ?? ""} onChange={(e) => set({ region: e.target.value || undefined })} options={[{ value: "", label: "Toutes" }, ...REGIONS.map((r) => ({ value: r, label: REGION_NAMES[r] }))]} />
          </div>
        </>
      );
    case "postsGrid":
      return (
        <>
          {heading}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Nombre d’articles" type="number" min={1} max={24} value={block.limit ?? 3} onChange={(e) => set({ limit: Number(e.target.value) || 3 })} />
            <TextInput label="Catégorie (adresse)" value={str("categorySlug")} placeholder="renovation" hint="Laisser vide pour tous les articles" onChange={(e) => set({ categorySlug: e.target.value || undefined })} />
          </div>
        </>
      );
    case "zones":
      return (
        <>
          {heading}
          <TextArea label="Introduction (facultative)" value={str("intro")} maxLength={2000} counterMax={2000} onChange={(e) => set({ intro: e.target.value })} />
          <p className="text-xs text-charcoal/60">Les zones affichées viennent des réglages (siège unique à Aulnay-sous-Bois).</p>
        </>
      );
    case "contactForm":
      return (
        <>
          {heading}
          <TextInput label="Étiquette de provenance" value={str("source")} placeholder="service:renovation" hint="Facultatif : minuscules, chiffres, « : », « - ». Permet de savoir d’où vient la demande." onChange={(e) => set({ source: e.target.value || undefined })} />
        </>
      );
    case "placeholderNotice":
      return <TextArea label="Message" required value={str("text")} maxLength={500} counterMax={500} onChange={(e) => set({ text: e.target.value })} />;
  }
}

/** Drops empty-string optional fields so optional zod fields (hrefs, ids) validate. */
export function cleanBlocks(blocks: BlockData[]): BlockData[] {
  return blocks.map((b) => {
    const out: BlockData = { ...b };
    for (const k of Object.keys(out)) {
      if (k === "doc" || k === "items" || k === "mediaIds") continue;
      if (out[k] === "" || out[k] === undefined || out[k] === null) delete out[k];
    }
    return out;
  });
}
