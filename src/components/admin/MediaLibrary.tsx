"use client";
// Media library client parts (owner: cms-admin): multi-file upload with progress, detail editor with crop/focal/replace.
/* eslint-disable @next/next/no-img-element -- admin previews of our own media */
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, type FormEvent } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { cropMediaAction, mediaUsagesAction, setFocalPointAction, updateMediaAction } from "@/app/admin/(panel)/_actions/media";
import { restoreAction, softDeleteAction } from "@/app/admin/(panel)/_actions/content";
import { LICENSE_LABELS, LICENSE_TYPES, type LicenseTypeKey } from "@/lib/cms/constants";
import type { MediaUsage } from "@/lib/media/service";
import { ACCEPT, uploadFile } from "./upload";
import { ActionButton, Card, Notice, Select, TextArea, TextInput, Toggle, btn, cx, useRunner, useToast } from "./ui";

interface Row { name: string; pct: number; status: "wait" | "up" | "ok" | "err"; error?: string }

export function UploadPanel() {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [license, setLicense] = useState<LicenseTypeKey>("UNKNOWN");
  const [credit, setCredit] = useState("");
  const [source, setSource] = useState("");
  const [placeholder, setPlaceholder] = useState(false);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function start(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    setRows(files.map((f) => ({ name: f.name, pct: 0, status: "wait" })));
    let okCount = 0;
    for (const [i, f] of files.entries()) {
      const patch = (p: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
      patch({ status: "up" });
      const res = await uploadFile(f, { alt: files.length === 1 ? alt : "", licenseType: license, credit, licenseSource: source, isPlaceholder: placeholder }, (pct) => patch({ pct }));
      if (res.ok) { okCount++; patch({ status: "ok", pct: 100 }); }
      else patch({ status: "err", error: res.error });
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    toast({ kind: okCount === files.length ? "success" : "info", text: `${okCount}/${files.length} image(s) importée(s). Renseignez le texte alternatif de chacune.` });
    router.refresh();
  }

  return (
    <Card title="Importer des images">
      <div className="grid gap-4 md:grid-cols-2">
        <Select label="Licence des images" value={license} onChange={(e) => setLicense(e.target.value as LicenseTypeKey)} options={LICENSE_TYPES.map((l) => ({ value: l, label: LICENSE_LABELS[l] }))} help="Indiquez d’où viennent les images : vos propres photos, une banque d’images libre (Unsplash, Pexels…), une image sous licence achetée… En cas de doute, laissez « inconnue » et vérifiez avant publication." />
        <TextInput label="Crédit / auteur" value={credit} onChange={(e) => setCredit(e.target.value)} maxLength={200} placeholder="Nom du photographe" />
        <TextInput label="Source de la licence (URL)" value={source} onChange={(e) => setSource(e.target.value)} maxLength={500} placeholder="https://…" />
        <TextInput label="Texte alternatif (si une seule image)" value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} help="Phrase décrivant l’image pour les personnes malvoyantes et pour Google. Indispensable pour publier." />
      </div>
      <div className="mt-4"><Toggle label="Images de démonstration" checked={placeholder} onChange={setPlaceholder} hint="Cochez pour des illustrations qui ne sont pas de vrais chantiers BatiNova." /></div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <label className={cx(btn.primary, "cursor-pointer", busy && "opacity-60")}>
          {busy ? "Import en cours…" : "Choisir des fichiers"}
          <input ref={input} type="file" accept={ACCEPT} multiple disabled={busy} className="sr-only" onChange={(e) => void start(Array.from(e.target.files ?? []))} />
        </label>
        <span className="text-xs text-charcoal/70">JPEG, PNG, WebP ou AVIF · 15 Mo maximum · 40 mégapixels maximum. Les métadonnées (GPS, appareil) sont supprimées automatiquement.</span>
      </div>
      {rows.length ? (
        <ul className="mt-4 space-y-2" aria-live="polite">
          {rows.map((r, i) => (
            <li key={i} className="text-sm">
              <div className="flex justify-between gap-2"><span className="truncate">{r.name}</span><span className={r.status === "err" ? "text-red-700" : ""}>{r.status === "ok" ? "OK" : r.status === "err" ? r.error : r.status === "up" ? `${r.pct} %` : "En attente"}</span></div>
              <progress className="h-1.5 w-full" max={100} value={r.pct} aria-label={`Progression ${r.name}`} />
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export interface MediaDetailProps {
  media: {
    id: string; url: string; sourceUrl: string; width: number | null; height: number | null; originalName: string; sizeBytes: number;
    alt: string; caption: string; credit: string; licenseType: LicenseTypeKey; licenseSource: string; licenseNotes: string; isPlaceholder: boolean;
    focalX: number | null; focalY: number | null; deleted: boolean; masterWidth: number | null;
  };
  usages: MediaUsage[];
}

const USAGE_HREF: Record<MediaUsage["type"], (id: string) => string> = {
  page: (id) => `/admin/pages/${id}`, post: (id) => `/admin/articles/${id}`, project: (id) => `/admin/realisations/${id}`, category: () => "/admin/taxonomie", settings: () => "/admin/reglages",
};

export function MediaDetail({ media, usages }: MediaDetailProps) {
  const router = useRouter();
  const { run, pending } = useRunner();
  const [m, setM] = useState({ alt: media.alt, caption: media.caption, credit: media.credit, licenseType: media.licenseType, licenseSource: media.licenseSource, licenseNotes: media.licenseNotes, isPlaceholder: media.isPlaceholder });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [focal, setFocal] = useState<{ x: number; y: number } | null>(media.focalX !== null && media.focalY !== null ? { x: media.focalX, y: media.focalY } : null);
  const [cropOpen, setCropOpen] = useState(false);
  const toast = useToast();
  const [replacing, setReplacing] = useState(false);

  function save(e: FormEvent) {
    e.preventDefault();
    setFe({});
    run(() => updateMediaAction({ id: media.id, ...m }), { onFail: (r) => setFe(r.fieldErrors ?? {}) });
  }
  async function replace(file: File | undefined) {
    if (!file) return;
    setReplacing(true);
    const r = await uploadFile(file, { replaceId: media.id });
    setReplacing(false);
    if (r.ok) { toast({ kind: "success", text: "Fichier remplacé : les contenus qui utilisent cette image sont à jour." }); router.refresh(); }
    else toast({ kind: "error", text: r.error });
  }
  const live = usages.filter((u) => !u.trashed);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-6">
        {media.deleted ? <Notice kind="warn">Ce média est dans la corbeille : il n’apparaît plus sur le site.</Notice> : null}
        {!media.alt.trim() ? <Notice kind="warn">Texte alternatif manquant : cette image ne pourra pas être utilisée dans un contenu publié.</Notice> : null}
        <Card title="Informations">
          <form onSubmit={save} className="space-y-4" noValidate>
            <TextInput label="Texte alternatif" required value={m.alt} onChange={(e) => setM({ ...m, alt: e.target.value })} maxLength={300} counterMax={300} error={fe.alt} help="Décrivez ce que montre l’image en une phrase claire (« Cuisine ouverte avec îlot central en chêne »). Lu par les lecteurs d’écran et utile au référencement. Ne bourrez pas de mots-clés." />
            <TextInput label="Légende (facultative)" value={m.caption} onChange={(e) => setM({ ...m, caption: e.target.value })} maxLength={300} />
            <TextInput label="Crédit / auteur" value={m.credit} onChange={(e) => setM({ ...m, credit: e.target.value })} maxLength={200} />
            <Select label="Type de licence" value={m.licenseType} onChange={(e) => setM({ ...m, licenseType: e.target.value as LicenseTypeKey })} options={LICENSE_TYPES.map((l) => ({ value: l, label: LICENSE_LABELS[l] }))} />
            <TextInput label="Source de la licence (URL)" value={m.licenseSource} onChange={(e) => setM({ ...m, licenseSource: e.target.value })} maxLength={500} />
            <TextArea label="Notes de licence" value={m.licenseNotes} onChange={(e) => setM({ ...m, licenseNotes: e.target.value })} maxLength={500} counterMax={500} rows={2} />
            <Toggle label="Image de démonstration" checked={m.isPlaceholder} onChange={(isPlaceholder) => setM({ ...m, isPlaceholder })} hint="Affichera « Contenu de démonstration » là où l’image est utilisée." />
            <button type="submit" disabled={pending} className={btn.primary}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
          </form>
        </Card>
        <Card title="Utilisations">
          {usages.length === 0 ? <p className="text-sm text-charcoal/70">Cette image n’est utilisée nulle part.</p> : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {usages.map((u, i) => <li key={i}><a className="underline" href={USAGE_HREF[u.type](u.id)}>{u.title}</a> — {u.field}{u.trashed ? " (dans la corbeille)" : ""}</li>)}
            </ul>
          )}
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Aperçu">
          <div className="relative">
            <img src={media.url} alt={media.alt} className="max-h-96 w-full bg-offwhite object-contain" />
            {focal ? <span aria-hidden="true" className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600/70" style={{ left: `${focal.x * 100}%`, top: `${focal.y * 100}%` }} /> : null}
          </div>
          <p className="mt-2 text-xs text-charcoal/70">{media.width}×{media.height} px · {(media.sizeBytes / 1024).toFixed(0)} Ko · {media.originalName}</p>
          <FocalPicker mediaId={media.id} url={media.url} focal={focal} onChange={setFocal} />
        </Card>
        <Card title="Actions">
          <div className="flex flex-col items-start gap-3">
            <button type="button" className={btn.secondary} onClick={() => setCropOpen(true)} disabled={media.deleted}>Recadrer l’image</button>
            <label className={cx(btn.secondary, "cursor-pointer")}>
              {replacing ? "Remplacement…" : "Remplacer le fichier"}
              <input type="file" accept={ACCEPT} className="sr-only" disabled={replacing || media.deleted} onChange={(e) => void replace(e.target.files?.[0])} />
            </label>
            <p className="text-xs text-charcoal/60">Remplacer garde le texte alternatif, la licence et toutes les utilisations.</p>
            {media.deleted ? (
              <ActionButton size="normal" run={() => restoreAction("media", media.id)}>Restaurer</ActionButton>
            ) : (
              <ActionButton size="normal" variant="danger" run={() => softDeleteAction("media", media.id)} onOk={() => router.push("/admin/mediatheque")} confirm={{ title: "Mettre cette image à la corbeille ?", message: live.length ? `Elle est utilisée dans ${live.length} contenu(s) : elle disparaîtra de ces pages jusqu’à restauration.` : "Elle n’est utilisée nulle part.", confirmLabel: "Mettre à la corbeille", danger: true }}>Mettre à la corbeille</ActionButton>
            )}
          </div>
        </Card>
      </div>
      {cropOpen ? <CropDialog mediaId={media.id} sourceUrl={media.sourceUrl} onClose={() => setCropOpen(false)} /> : null}
    </div>
  );
}

function FocalPicker({ mediaId, url, focal, onChange }: { mediaId: string; url: string; focal: { x: number; y: number } | null; onChange: (f: { x: number; y: number }) => void }) {
  const { run } = useRunner();
  const [open, setOpen] = useState(false);
  const [pt, setPt] = useState(focal ?? { x: 0.5, y: 0.5 });
  return (
    <div className="mt-3">
      <button type="button" className={cx(btn.secondary, btn.small)} onClick={() => setOpen((o) => !o)} aria-expanded={open}>Point focal</button>
      <span className="ml-2 align-middle text-xs text-charcoal/60">Zone à toujours garder visible quand l’image est recadrée automatiquement.</span>
      {open ? (
        <div className="mt-2 space-y-2">
          <div className="relative cursor-crosshair" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPt({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }); }}>
            <img src={url} alt="" className="w-full" />
            <span aria-hidden="true" className="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-600/70" style={{ left: `${pt.x * 100}%`, top: `${pt.y * 100}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Horizontal (%)<input type="range" min={0} max={100} value={Math.round(pt.x * 100)} onChange={(e) => setPt({ ...pt, x: Number(e.target.value) / 100 })} className="w-full" /></label>
            <label className="text-xs">Vertical (%)<input type="range" min={0} max={100} value={Math.round(pt.y * 100)} onChange={(e) => setPt({ ...pt, y: Number(e.target.value) / 100 })} className="w-full" /></label>
          </div>
          <button type="button" className={btn.primary} onClick={() => run(() => setFocalPointAction({ id: mediaId, ...pt }), { onOk: () => onChange(pt) })}>Enregistrer le point focal</button>
        </div>
      ) : null}
    </div>
  );
}

const ASPECTS: { label: string; value: number | undefined }[] = [
  { label: "Libre", value: undefined }, { label: "16:9", value: 16 / 9 }, { label: "4:3", value: 4 / 3 }, { label: "3:2", value: 3 / 2 }, { label: "1:1", value: 1 }, { label: "3:4", value: 3 / 4 },
];

function CropDialog({ mediaId, sourceUrl, onClose }: { mediaId: string; sourceUrl: string; onClose: () => void }) {
  const router = useRouter();
  const { run, pending } = useRunner();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [area, setArea] = useState<Area | null>(null);
  const onComplete = useCallback((_: Area, px: Area) => setArea(px), []);
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="crop-title" className="fixed inset-0 z-40 flex flex-col bg-charcoal/90 p-4 text-offwhite">
      <h2 id="crop-title" className="font-serif text-lg">Recadrer l’image</h2>
      <p className="text-xs text-offwhite/70">Le recadrage part toujours de l’image d’origine : vous pouvez recadrer à nouveau plus tard.</p>
      <div className="relative my-3 min-h-0 flex-1">
        <Cropper image={sourceUrl} crop={crop} zoom={zoom} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onComplete} keyboardStep={10} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">Format&nbsp;
          <select className="rounded-sm bg-white px-2 py-1 text-charcoal" onChange={(e) => setAspect(ASPECTS[Number(e.target.value)]?.value)}>
            {ASPECTS.map((a, i) => <option key={a.label} value={i}>{a.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">Zoom <input type="range" min={1} max={4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <div className="ml-auto flex gap-2">
          <button type="button" className={btn.secondary + " text-charcoal"} onClick={onClose}>Annuler</button>
          <button type="button" disabled={!area || pending} className={btn.primary + " border border-offwhite"} onClick={() => area && run(() => cropMediaAction({ id: mediaId, x: area.x, y: area.y, width: area.width, height: area.height, unit: "pixels" }), { onOk: () => { onClose(); router.refresh(); } })}>
            {pending ? "Recadrage…" : "Appliquer"}
          </button>
        </div>
      </div>
    </div>
  );
}

void mediaUsagesAction;
