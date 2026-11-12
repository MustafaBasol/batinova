"use client";
// WYSIWYG editor (owner: cms-admin). Output = whitelisted Tiptap JSON; the server validates again.
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { FONT_SIZES, HIGHLIGHT_COLORS, IMAGE_SIZES, TEXT_COLORS, CALLOUT_VARIANTS, countWords } from "@/lib/richtext/schema";
import { isSafeHref } from "@/lib/security/href";
import { mediaUrl } from "@/lib/content/paths";
import { useMediaPicker, type MediaItem } from "../MediaPicker";
import { btn, cx, inputCls, useToast } from "../ui";
import { buildExtensions } from "./extensions";
import { seedMedia, mediaUrlFor } from "./media-cache";

void mediaUrl;
export type RichDoc = Record<string, unknown>;

export function RichTextEditor({
  value,
  onChange,
  initialMedia = [],
  label = "Contenu",
  id = "rt-editor",
}: {
  value: RichDoc;
  onChange: (doc: RichDoc) => void;
  initialMedia?: MediaItem[];
  label?: string;
  id?: string;
}) {
  seedMedia(initialMedia);
  const extensions = useMemo(() => buildExtensions(mediaUrlFor), []);
  const [words, setWords] = useState(0);
  const editor = useEditor({
    extensions,
    content: value,
    immediatelyRender: false,
    editorProps: { attributes: { role: "textbox", "aria-multiline": "true", "aria-label": label, id } },
    onCreate: ({ editor: e }) => setWords(countWords(e.getText())),
    onUpdate: ({ editor: e }) => {
      // ProseMirror `attrs` are null-prototype objects: React encodes those as opaque temporary references ("$T") when the
      // document is sent to a Server Action, which the server then rejects ("attrs invalides"). A JSON round-trip yields plain objects.
      onChange(JSON.parse(JSON.stringify(e.getJSON())) as RichDoc);
      setWords(countWords(e.getText()));
    },
  });
  if (!editor) return <div className="min-h-40 rounded-sm border border-charcoal/20 bg-white p-4 text-sm text-charcoal/60">Chargement de l’éditeur…</div>;
  return (
    <div className="btnv-editor rounded-sm border border-charcoal/30 bg-white">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
      <p className="flex flex-wrap justify-between gap-2 border-t border-charcoal/15 px-4 py-2 text-xs text-charcoal/70" aria-live="off">
        <span>{words} mot{words > 1 ? "s" : ""}</span>
        <span>Lecture : environ {Math.max(1, Math.round(words / 220))} min</span>
      </p>
    </div>
  );
}

function TB({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cx("min-w-8 rounded-sm border px-2 py-1 text-sm disabled:opacity-40", active ? "border-charcoal bg-charcoal text-offwhite" : "border-transparent hover:border-charcoal/30 hover:bg-offwhite")}
    >
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-1 h-6 w-px bg-charcoal/20" aria-hidden="true" />;

function Toolbar({ editor }: { editor: Editor }) {
  const st = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      p: e.isActive("paragraph"),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      h4: e.isActive("heading", { level: 4 }),
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      sub: e.isActive("subscript"),
      sup: e.isActive("superscript"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      justify: e.isActive({ textAlign: "justify" }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      callout: e.isActive("callout"),
      link: e.isActive("link"),
      image: e.isActive("image"),
      table: e.isActive("table"),
      fontSize: (e.getAttributes("textStyle").fontSize as string | null) ?? "base",
      color: (e.getAttributes("textStyle").color as string | null) ?? "",
      highlight: e.isActive("highlight") ? ((e.getAttributes("highlight").color as string) ?? "beige") : "",
    }),
  });
  const c = () => editor.chain().focus();
  const [linkOpen, setLinkOpen] = useState(false);
  const [imgEdit, setImgEdit] = useState<{ mediaId: string | null; alt: string; caption: string; size: string; pos: "insert" | "update" } | null>(null);
  const picker = useMediaPicker();

  const setStyle = (patch: Record<string, string | null>) => {
    const cur = editor.getAttributes("textStyle");
    const next = { fontSize: cur.fontSize ?? null, color: cur.color ?? null, ...patch };
    if (!next.fontSize && !next.color) c().unsetMark("textStyle").run();
    else c().setMark("textStyle", next).run();
  };

  return (
    <div role="toolbar" aria-label="Mise en forme du texte" className="flex flex-wrap items-center gap-0.5 border-b border-charcoal/20 bg-offwhite/60 p-2">
      <TB label="Annuler" disabled={!st.canUndo} onClick={() => c().undo().run()}>↶</TB>
      <TB label="Rétablir" disabled={!st.canRedo} onClick={() => c().redo().run()}>↷</TB>
      <Sep />
      <TB label="Paragraphe" active={st.p} onClick={() => c().setParagraph().run()}>¶</TB>
      <TB label="Titre de section (H2)" active={st.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>H2</TB>
      <TB label="Sous-titre (H3)" active={st.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>H3</TB>
      <TB label="Intertitre (H4)" active={st.h4} onClick={() => c().toggleHeading({ level: 4 }).run()}>H4</TB>
      <Sep />
      <TB label="Gras" active={st.bold} onClick={() => c().toggleBold().run()}><b>G</b></TB>
      <TB label="Italique" active={st.italic} onClick={() => c().toggleItalic().run()}><i>I</i></TB>
      <TB label="Souligné" active={st.underline} onClick={() => c().toggleUnderline().run()}><u>S</u></TB>
      <TB label="Barré" active={st.strike} onClick={() => c().toggleStrike().run()}><s>B</s></TB>
      <TB label="Exposant" active={st.sup} onClick={() => c().toggleSuperscript().run()}>x²</TB>
      <TB label="Indice" active={st.sub} onClick={() => c().toggleSubscript().run()}>x₂</TB>
      <TB label="Effacer la mise en forme" onClick={() => c().unsetAllMarks().clearNodes().run()}>⌫</TB>
      <Sep />
      <label className="sr-only" htmlFor="rt-size">Taille du texte</label>
      <select id="rt-size" title="Taille du texte" value={st.fontSize} onChange={(e) => setStyle({ fontSize: e.target.value === "base" ? null : e.target.value })} className={cx(inputCls, "w-auto py-1")}>
        {Object.entries(FONT_SIZES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <label className="sr-only" htmlFor="rt-color">Couleur du texte</label>
      <select id="rt-color" title="Couleur du texte" value={st.color} onChange={(e) => setStyle({ color: e.target.value || null })} className={cx(inputCls, "w-auto py-1")}>
        <option value="">Couleur par défaut</option>
        {Object.entries(TEXT_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <label className="sr-only" htmlFor="rt-hl">Surlignage</label>
      <select id="rt-hl" title="Surlignage" value={st.highlight} onChange={(e) => (e.target.value ? c().setMark("highlight", { color: e.target.value }).run() : c().unsetMark("highlight").run())} className={cx(inputCls, "w-auto py-1")}>
        <option value="">Sans surlignage</option>
        {Object.entries(HIGHLIGHT_COLORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <Sep />
      <TB label="Aligner à gauche" active={st.left} onClick={() => c().setTextAlign("left").run()}>⇤</TB>
      <TB label="Centrer" active={st.center} onClick={() => c().setTextAlign("center").run()}>↔</TB>
      <TB label="Aligner à droite" active={st.right} onClick={() => c().setTextAlign("right").run()}>⇥</TB>
      <TB label="Justifier" active={st.justify} onClick={() => c().setTextAlign("justify").run()}>≡</TB>
      <Sep />
      <TB label="Liste à puces" active={st.bullet} onClick={() => c().toggleBulletList().run()}>•≡</TB>
      <TB label="Liste numérotée" active={st.ordered} onClick={() => c().toggleOrderedList().run()}>1.</TB>
      <TB label="Citation" active={st.quote} onClick={() => c().toggleBlockquote().run()}>❝</TB>
      <TB label="Ligne de séparation" onClick={() => c().setHorizontalRule().run()}>―</TB>
      <label className="sr-only" htmlFor="rt-callout">Encadré</label>
      <select
        id="rt-callout"
        title="Encadré « À retenir »"
        value={st.callout ? ((editor.getAttributes("callout").variant as string) ?? "retenir") : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) c().lift("callout").run();
          else if (editor.isActive("callout")) c().updateAttributes("callout", { variant: v }).run();
          else c().wrapIn("callout", { variant: v }).run();
        }}
        className={cx(inputCls, "w-auto py-1")}
      >
        <option value="">Pas d’encadré</option>
        {Object.entries(CALLOUT_VARIANTS).map(([k, v]) => <option key={k} value={k}>Encadré : {v}</option>)}
      </select>
      <Sep />
      <TB label="Lien (ajouter ou modifier)" active={st.link} onClick={() => setLinkOpen(true)}>🔗</TB>
      <TB label="Image de la médiathèque" active={st.image} onClick={() => (st.image ? setImgEdit({ mediaId: editor.getAttributes("image").mediaId, alt: editor.getAttributes("image").alt ?? "", caption: editor.getAttributes("image").caption ?? "", size: editor.getAttributes("image").size ?? "medium", pos: "update" }) : picker.pick((m) => { seedMedia([m]); setImgEdit({ mediaId: m.id, alt: m.alt, caption: "", size: "medium", pos: "insert" }); }))}>🖼</TB>
      <TB label="Insérer un tableau" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>▦</TB>
      {st.table ? (
        <>
          <TB label="Ajouter une ligne" onClick={() => c().addRowAfter().run()}>+L</TB>
          <TB label="Supprimer la ligne" onClick={() => c().deleteRow().run()}>−L</TB>
          <TB label="Ajouter une colonne" onClick={() => c().addColumnAfter().run()}>+C</TB>
          <TB label="Supprimer la colonne" onClick={() => c().deleteColumn().run()}>−C</TB>
          <TB label="Supprimer le tableau" onClick={() => c().deleteTable().run()}>🗑</TB>
        </>
      ) : null}
      {picker.dialog}
      <LinkDialog editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} />
      <ImageDialog
        state={imgEdit}
        onClose={() => setImgEdit(null)}
        onSubmit={(v) => {
          if (!v.mediaId) return;
          if (v.pos === "insert") c().insertContent({ type: "image", attrs: { mediaId: v.mediaId, alt: v.alt, caption: v.caption || null, size: v.size } }).run();
          else c().updateAttributes("image", { alt: v.alt, caption: v.caption || null, size: v.size }).run();
          setImgEdit(null);
        }}
      />
    </div>
  );
}

/**
 * Dialog contents are NOT HTML forms: they sit inside the page editor's own form element, and a nested form's native submit
 * (observed in the production build: the submit event neither reached React nor bubbled) reloads the page and loses the draft.
 * Buttons are type="button"; Enter in a text input applies.
 */
const enterApplies = (apply: () => void) => (e: React.KeyboardEvent) => {
  const t = e.target as HTMLInputElement;
  if (e.key === "Enter" && t.tagName === "INPUT" && t.type !== "checkbox") {
    e.preventDefault();
    apply();
  }
};

function ModalDialog({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby={labelledBy} className="m-auto w-[min(92vw,28rem)] rounded-sm border border-charcoal/20 bg-white p-0 backdrop:bg-charcoal/50">
      {open ? children : null}
    </dialog>
  );
}

function LinkDialog({ editor, open, onClose }: { editor: Editor; open: boolean; onClose: () => void }) {
  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="link-title">
      <LinkForm editor={editor} onClose={onClose} />
    </ModalDialog>
  );
}

function LinkForm({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const a = editor.getAttributes("link");
  const [url, setUrl] = useState((a.href as string) ?? "");
  const [nofollow, setNofollow] = useState(!!a.nofollow);
  const [blank, setBlank] = useState(a.target === "_blank");
  const [err, setErr] = useState<string | null>(null);
  function submit() {
    let href = url.trim();
    if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(href)) href = `https://${href}`;
    if (!isSafeHref(href, { allowHttp: true })) return setErr("Lien non autorisé. Utilisez /page-du-site, https://…, mailto:… ou tel:….");
    editor.chain().focus().extendMarkRange("link").setMark("link", { href, nofollow, target: blank ? "_blank" : null }).run();
    onClose();
  }
  return (
    <div role="group" aria-labelledby="link-title" onKeyDown={enterApplies(submit)} className="space-y-4 p-6">
      <h2 id="link-title" className="font-serif text-lg">Lien</h2>
      <div>
        <label htmlFor="rt-url" className="text-sm font-medium">Adresse du lien</label>
        <input id="rt-url" value={url} onChange={(e) => setUrl(e.target.value)} className={inputCls} placeholder="https://… ou /contact" autoFocus />
        {err ? <p role="alert" className="mt-1 text-xs text-red-700">{err}</p> : null}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blank} onChange={(e) => setBlank(e.target.checked)} className="accent-charcoal" /> Ouvrir dans un nouvel onglet</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={nofollow} onChange={(e) => setNofollow(e.target.checked)} className="accent-charcoal" /> Ne pas transmettre d’autorité SEO (nofollow)</label>
      <div className="flex flex-wrap justify-end gap-2">
        {editor.isActive("link") ? <button type="button" className={btn.danger} onClick={() => { editor.chain().focus().extendMarkRange("link").unsetMark("link").run(); onClose(); }}>Retirer le lien</button> : null}
        <button type="button" className={btn.secondary} onClick={onClose}>Annuler</button>
        <button type="button" onClick={submit} className={btn.primary}>Appliquer</button>
      </div>
    </div>
  );
}

type ImgState = { mediaId: string | null; alt: string; caption: string; size: string; pos: "insert" | "update" };
function ImageDialog({ state, onClose, onSubmit }: { state: ImgState | null; onClose: () => void; onSubmit: (v: ImgState) => void }) {
  return (
    <ModalDialog open={!!state} onClose={onClose} labelledBy="img-title">
      {state ? <ImageForm initial={state} onClose={onClose} onSubmit={onSubmit} /> : null}
    </ModalDialog>
  );
}

function ImageForm({ initial, onClose, onSubmit }: { initial: ImgState; onClose: () => void; onSubmit: (v: ImgState) => void }) {
  const [v, setV] = useState<ImgState>(initial);
  const toast = useToast();
  const apply = () => {
    if (!v.alt.trim()) return toast({ kind: "error", text: "Le texte alternatif est obligatoire." });
    onSubmit({ ...v, alt: v.alt.trim() });
  };
  return (
    <div role="group" aria-labelledby="img-title" onKeyDown={enterApplies(apply)} className="space-y-4 p-6">
      <h2 id="img-title" className="font-serif text-lg">Image dans le texte</h2>
      <div>
        <label htmlFor="img-alt" className="text-sm font-medium">Texte alternatif (obligatoire)</label>
        <input id="img-alt" value={v.alt} onChange={(e) => setV({ ...v, alt: e.target.value })} className={inputCls} maxLength={300} required autoFocus />
        <p className="mt-1 text-xs text-charcoal/60">Décrivez ce que montre l’image pour les personnes qui ne la voient pas.</p>
      </div>
      <div>
        <label htmlFor="img-cap" className="text-sm font-medium">Légende (facultative)</label>
        <input id="img-cap" value={v.caption} onChange={(e) => setV({ ...v, caption: e.target.value })} className={inputCls} maxLength={300} />
      </div>
      <div>
        <label htmlFor="img-size" className="text-sm font-medium">Taille</label>
        <select id="img-size" value={v.size} onChange={(e) => setV({ ...v, size: e.target.value })} className={inputCls}>
          {Object.entries(IMAGE_SIZES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className={btn.secondary} onClick={onClose}>Annuler</button>
        <button type="button" onClick={apply} className={btn.primary}>{v.pos === "insert" ? "Insérer" : "Mettre à jour"}</button>
      </div>
    </div>
  );
}
