"use client";
import { useState } from "react";
import { saveNavAction } from "@/app/admin/(panel)/_actions/content";
import { NAV_LOCATIONS, NAV_LOCATION_LABELS, type NavLocationKey } from "@/lib/cms/constants";
import { Card, Notice, Select, TextInput, Toggle, btn, cx, useRunner } from "./ui";

export interface NavNode { id?: string; label: string; pageId: string | null; href: string; openInNewTab: boolean; enabled: boolean; children: NavNode[] }
type PageOpt = { id: string; title: string; path: string };
const blank = (): NavNode => ({ label: "", pageId: null, href: "", openInNewTab: false, enabled: true, children: [] });

function ItemRow({ n, pages, onChange, onMove, onRemove, first, last, error, nested }: { n: NavNode; pages: PageOpt[]; onChange: (n: NavNode) => void; onMove: (d: -1 | 1) => void; onRemove: () => void; first: boolean; last: boolean; error?: string; nested?: boolean }) {
  const custom = !n.pageId;
  return (
    <div className={cx("space-y-3 rounded-sm border border-charcoal/20 bg-white p-3", nested && "ml-6 bg-offwhite")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput label="Libellé" value={n.label} maxLength={60} onChange={(e) => onChange({ ...n, label: e.target.value })} />
        <Select label="Destination" value={custom ? "" : n.pageId!} onChange={(e) => onChange({ ...n, pageId: e.target.value || null })} options={[{ value: "", label: "Lien personnalisé…" }, ...pages.map((p) => ({ value: p.id, label: `${p.title} (/${p.path})` }))]} help="Une page liée disparaît automatiquement du menu si elle n’est pas publiée." />
        {custom ? <TextInput label="Lien" value={n.href} placeholder="/contact ou https://…" onChange={(e) => onChange({ ...n, href: e.target.value })} /> : <div />}
      </div>
      {error ? <p role="alert" className="text-xs text-red-700">{error}</p> : null}
      <div className="flex flex-wrap items-center gap-4">
        <Toggle label="Actif" checked={n.enabled} onChange={(enabled) => onChange({ ...n, enabled })} />
        <Toggle label="Nouvel onglet" checked={n.openInNewTab} onChange={(openInNewTab) => onChange({ ...n, openInNewTab })} />
        <span className="ml-auto flex gap-2">
          <button type="button" className={cx(btn.secondary, btn.small)} disabled={first} onClick={() => onMove(-1)} aria-label={`Monter ${n.label || "l’élément"}`}>↑</button>
          <button type="button" className={cx(btn.secondary, btn.small)} disabled={last} onClick={() => onMove(1)} aria-label={`Descendre ${n.label || "l’élément"}`}>↓</button>
          <button type="button" className={cx(btn.ghost, btn.small, "text-red-700")} onClick={onRemove}>Retirer</button>
        </span>
      </div>
    </div>
  );
}

function swap<T>(a: T[], i: number, d: -1 | 1): T[] {
  const j = i + d;
  if (j < 0 || j >= a.length) return a;
  const n = [...a];
  [n[i], n[j]] = [n[j]!, n[i]!];
  return n;
}

function LocationEditor({ location, initial, pages }: { location: NavLocationKey; initial: NavNode[]; pages: PageOpt[] }) {
  const [items, setItems] = useState(initial);
  const [fe, setFe] = useState<Record<string, string>>({});
  const { run, pending } = useRunner();
  const nested = location === "HEADER";
  const payload = () => ({
    location,
    items: items.map((i) => ({ id: i.id, label: i.label, pageId: i.pageId, href: i.pageId ? null : i.href, openInNewTab: i.openInNewTab, enabled: i.enabled, children: i.children.map((c) => ({ id: c.id, label: c.label, pageId: c.pageId, href: c.pageId ? null : c.href, openInNewTab: c.openInNewTab, enabled: c.enabled })) })),
  });
  return (
    <Card title={NAV_LOCATION_LABELS[location]}>
      <div className="space-y-3">
        {items.length === 0 ? <p className="text-sm text-charcoal/70">Aucun élément. Sans élément, le site utilise ses liens par défaut.</p> : null}
        {items.map((it, i) => (
          <div key={it.id ?? i} className="space-y-2">
            <ItemRow n={it} pages={pages} first={i === 0} last={i === items.length - 1} error={fe[`item:${i}`]} onChange={(n) => setItems(items.map((x, k) => (k === i ? n : x)))} onMove={(d) => setItems(swap(items, i, d))} onRemove={() => setItems(items.filter((_, k) => k !== i))} />
            {nested ? (
              <>
                {it.children.map((c, j) => (
                  <ItemRow key={c.id ?? j} nested n={c} pages={pages} first={j === 0} last={j === it.children.length - 1} error={fe[`item:${i}.${j}`]}
                    onChange={(n) => setItems(items.map((x, k) => (k === i ? { ...x, children: x.children.map((y, m) => (m === j ? n : y)) } : x)))}
                    onMove={(d) => setItems(items.map((x, k) => (k === i ? { ...x, children: swap(x.children, j, d) } : x)))}
                    onRemove={() => setItems(items.map((x, k) => (k === i ? { ...x, children: x.children.filter((_, m) => m !== j) } : x)))} />
                ))}
                <button type="button" className={cx(btn.ghost, btn.small, "ml-6")} disabled={it.children.length >= 12} onClick={() => setItems(items.map((x, k) => (k === i ? { ...x, children: [...x.children, blank()] } : x)))}>+ Sous-menu</button>
              </>
            ) : null}
          </div>
        ))}
        <div className="flex gap-2">
          <button type="button" className={btn.secondary} disabled={items.length >= 30} onClick={() => setItems([...items, blank()])}>Ajouter un élément</button>
          <button type="button" className={btn.primary} disabled={pending} onClick={() => { setFe({}); run(() => saveNavAction(payload()), { onFail: (r) => setFe(r.fieldErrors ?? {}) }); }}>{pending ? "Enregistrement…" : "Enregistrer cette navigation"}</button>
        </div>
      </div>
    </Card>
  );
}

export function NavEditor({ data, pages }: { data: Record<NavLocationKey, NavNode[]>; pages: PageOpt[] }) {
  return (
    <div className="space-y-6">
      <Notice kind="info">Les liens vers une page se mettent à jour automatiquement si l’adresse change et disparaissent si la page n’est plus publiée.</Notice>
      {NAV_LOCATIONS.map((l) => <LocationEditor key={l} location={l} initial={data[l]} pages={pages} />)}
    </div>
  );
}
