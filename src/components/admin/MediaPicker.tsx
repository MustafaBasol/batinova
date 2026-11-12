"use client";
// Media picker (owner: cms-admin): modal over the library + single and multiple fields.
/* eslint-disable @next/next/no-img-element -- admin thumbnails come from our own /media route */
import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPT, uploadFile } from "./upload";
import { btn, cx, inputCls, useToast } from "./ui";

export interface MediaItem {
  id: string;
  url: string;
  alt: string;
  originalName: string;
  width: number | null;
  height: number | null;
  isPlaceholder: boolean;
}

const cache = new Map<string, MediaItem>();

async function fetchList(params: Record<string, string>): Promise<{ items: MediaItem[]; hasMore: boolean }> {
  const res = await fetch(`/admin/mediatheque/liste?${new URLSearchParams(params)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  const data = (await res.json()) as { items: MediaItem[]; hasMore: boolean };
  for (const i of data.items) cache.set(i.id, i);
  return data;
}

export function useMediaItems(ids: string[]): Record<string, MediaItem | undefined> {
  const [, force] = useState(0);
  const key = ids.join(",");
  useEffect(() => {
    const missing = ids.filter((i) => i && !cache.has(i));
    if (!missing.length) return;
    let live = true;
    fetchList({ ids: missing.join(",") })
      .then(() => live && force((n) => n + 1))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return Object.fromEntries(ids.map((i) => [i, cache.get(i)]));
}

export function MediaPickerDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (m: MediaItem) => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [alt, setAlt] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const toast = useToast();

  const load = useCallback(async (p: number, query: string, append: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchList({ page: String(p), ...(query ? { q: query } : {}) });
      setItems((cur) => (append ? [...cur, ...data.items] : data.items));
      setMore(data.hasMore);
    } catch {
      setError("Impossible de charger la médiathèque (session expirée ?).");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      void load(1, "", false);
      setPage(1);
      setQ("");
    }
    if (!open && d.open) d.close();
  }, [open, load]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setProgress(0);
    const r = await uploadFile(file, { alt, licenseType: "UNKNOWN" }, setProgress);
    setProgress(null);
    if (!r.ok) return toast({ kind: "error", text: r.error });
    toast({ kind: "success", text: alt ? "Image téléversée." : "Image téléversée — pensez à renseigner son texte alternatif." });
    setAlt("");
    await load(1, q, false);
  }

  return (
    <dialog ref={ref} aria-labelledby="picker-title" onClose={onClose} className="m-auto h-[min(90vh,46rem)] w-[min(96vw,60rem)] rounded-sm border border-charcoal/20 bg-white p-0 text-charcoal backdrop:bg-charcoal/50">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-charcoal/15 px-5 py-3">
          <h2 id="picker-title" className="font-serif text-lg">
            Choisir une image
          </h2>
          <button type="button" className={btn.secondary} onClick={onClose}>
            Fermer
          </button>
        </div>
        <div className="grid gap-3 border-b border-charcoal/15 px-5 py-3 sm:grid-cols-[1fr_auto]">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              void load(1, q, false);
            }}
            className="flex gap-2"
          >
            <label htmlFor="picker-q" className="sr-only">
              Rechercher une image
            </label>
            <input id="picker-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (texte alternatif, nom)…" className={inputCls} />
            <button type="submit" className={btn.secondary}>
              Chercher
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="picker-alt" className="sr-only">
              Texte alternatif de la nouvelle image
            </label>
            <input id="picker-alt" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Texte alternatif (nouvelle image)" className={cx(inputCls, "w-56")} />
            <label className={cx(btn.primary, "cursor-pointer")}>
              {progress === null ? "Téléverser" : `${progress} %`}
              <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {error ? <p role="alert" className="text-red-700">{error}</p> : null}
          {!busy && items.length === 0 && !error ? <p className="text-sm text-charcoal/70">Aucune image. Téléversez-en une ci-dessus.</p> : null}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {items.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => onPick(m)} className="group block w-full rounded-sm border border-charcoal/20 text-left hover:border-charcoal focus-visible:border-charcoal">
                  <img src={m.url} alt="" loading="lazy" className="aspect-square w-full bg-offwhite object-cover" />
                  <span className="block p-2 text-xs">
                    <span className="block truncate font-medium">{m.originalName}</span>
                    {m.alt ? <span className="block truncate text-charcoal/70">{m.alt}</span> : <span className="block text-red-700">Texte alternatif manquant</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {more ? (
            <button type="button" className={cx(btn.secondary, "mt-4")} disabled={busy} onClick={() => { setPage(page + 1); void load(page + 1, q, true); }}>
              Charger plus
            </button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

export function MediaField({ label, value, onChange, hint, error }: { label: string; value: string | null | undefined; onChange: (id: string | null) => void; hint?: string; error?: string | null }) {
  const [open, setOpen] = useState(false);
  const items = useMediaItems(value ? [value] : []);
  const m = value ? items[value] : undefined;
  return (
    <div className="space-y-1">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex items-center gap-3 rounded-sm border border-charcoal/20 bg-white p-2">
        {value ? (
          m ? <img src={m.url} alt="" className="h-16 w-16 object-cover" /> : <div className="h-16 w-16 bg-offwhite" aria-hidden="true" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center bg-offwhite text-xs text-charcoal/50" aria-hidden="true">
            Aucune
          </div>
        )}
        <div className="min-w-0 flex-1 text-xs">
          {m ? (
            <>
              <p className="truncate font-medium">{m.originalName}</p>
              {m.alt ? <p className="truncate text-charcoal/70">Alt : {m.alt}</p> : <p className="text-red-700">Texte alternatif manquant : requis pour publier</p>}
              {m.isPlaceholder ? <p className="text-amber-800">Image de démonstration</p> : null}
            </>
          ) : (
            <p className="text-charcoal/60">{value ? "Chargement…" : "Aucune image sélectionnée"}</p>
          )}
        </div>
        <button type="button" className={cx(btn.secondary, btn.small)} onClick={() => setOpen(true)}>
          {value ? "Changer" : "Choisir"}
        </button>
        {value ? (
          <button type="button" className={cx(btn.ghost, btn.small)} onClick={() => onChange(null)}>
            Retirer
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-xs text-charcoal/60">{hint}</p> : null}
      {error ? <p role="alert" className="text-xs font-medium text-red-700">{error}</p> : null}
      <MediaPickerDialog open={open} onClose={() => setOpen(false)} onPick={(it) => { onChange(it.id); setOpen(false); }} />
    </div>
  );
}

/** Ordered list of media ids with up/down buttons (keyboard friendly). */
export function MediaListField({ label, values, onChange, max = 40, hint }: { label: string; values: string[]; onChange: (ids: string[]) => void; max?: number; hint?: string }) {
  const [open, setOpen] = useState(false);
  const items = useMediaItems(values);
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="text-xs text-charcoal/60">{hint}</p> : null}
      <ol className="space-y-2">
        {values.map((id, i) => {
          const m = items[id];
          return (
            <li key={`${id}-${i}`} className="flex items-center gap-3 rounded-sm border border-charcoal/20 bg-white p-2">
              <span className="w-5 text-center text-xs text-charcoal/60">{i + 1}</span>
              {m ? <img src={m.url} alt="" className="h-12 w-12 object-cover" /> : <div className="h-12 w-12 bg-offwhite" aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate text-xs">
                {m?.originalName ?? "…"}
                {m && !m.alt ? <span className="ml-2 text-red-700">sans texte alternatif</span> : null}
              </span>
              <button type="button" className={cx(btn.secondary, btn.small)} aria-label={`Monter l’image ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className={cx(btn.secondary, btn.small)} aria-label={`Descendre l’image ${i + 1}`} disabled={i === values.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button type="button" className={cx(btn.ghost, btn.small)} onClick={() => onChange(values.filter((_, k) => k !== i))}>Retirer</button>
            </li>
          );
        })}
      </ol>
      <button type="button" className={btn.secondary} disabled={values.length >= max} onClick={() => setOpen(true)}>
        Ajouter une image
      </button>
      <MediaPickerDialog open={open} onClose={() => setOpen(false)} onPick={(it) => { onChange([...values, it.id]); setOpen(false); }} />
    </div>
  );
}

/** Single-media picker that reports the full item (used by the rich text image dialog). */
export function useMediaPicker() {
  const [open, setOpen] = useState(false);
  const cb = useRef<((m: MediaItem) => void) | null>(null);
  const pick = useCallback((fn: (m: MediaItem) => void) => {
    cb.current = fn;
    setOpen(true);
  }, []);
  const dialog = (
    <MediaPickerDialog
      open={open}
      onClose={() => setOpen(false)}
      onPick={(m) => {
        setOpen(false);
        cb.current?.(m);
      }}
    />
  );
  return { pick, dialog };
}
