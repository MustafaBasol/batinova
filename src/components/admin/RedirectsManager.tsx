"use client";
import { useState } from "react";
import { deleteRedirectAction, saveRedirectAction } from "@/app/admin/(panel)/_actions/content";
import { ActionButton, Card, Notice, Select, TextInput, btn, useRunner } from "./ui";

export interface RedirectRow { id: string; fromPath: string; toPath: string | null; statusCode: number; hits: number; note: string; auto: boolean }

function Form({ row, isOwner, onDone }: { row?: RedirectRow; isOwner: boolean; onDone?: () => void }) {
  const { run, pending } = useRunner();
  const [s, setS] = useState({ fromPath: row?.fromPath ?? "", toPath: row?.toPath ?? "", statusCode: String(row?.statusCode ?? 301), note: row?.note ?? "" });
  const [fe, setFe] = useState<Record<string, string>>({});
  const gone = s.statusCode === "410";
  return (
    <form noValidate className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setFe({}); run(() => saveRedirectAction({ id: row?.id, fromPath: s.fromPath, toPath: gone ? null : s.toPath, statusCode: Number(s.statusCode), note: s.note }), { onOk: () => { if (!row) setS({ fromPath: "", toPath: "", statusCode: "301", note: "" }); onDone?.(); }, onFail: (r) => setFe(r.fieldErrors ?? {}) }); }}>
      <TextInput label="Ancienne adresse" required value={s.fromPath} placeholder="/ancienne-page" error={fe.fromPath} onChange={(e) => setS({ ...s, fromPath: e.target.value })} hint="Commence par « / », sans domaine ni paramètres." />
      <Select label="Type" value={s.statusCode} onChange={(e) => setS({ ...s, statusCode: e.target.value })} options={[
        { value: "301", label: "301 — déplacée définitivement (recommandé)" }, { value: "302", label: "302 — déplacée temporairement" }, { value: "308", label: "308 — définitive, même méthode" },
        ...(isOwner ? [{ value: "410", label: "410 — supprimée définitivement (propriétaire)" }] : []),
      ]} help="Une redirection 301 transfère les visiteurs et le référencement de l’ancienne adresse vers la nouvelle. 410 indique à Google que la page n’existe plus." />
      {!gone ? <TextInput label="Nouvelle adresse" required value={s.toPath} placeholder="/nouvelle-page" error={fe.toPath} onChange={(e) => setS({ ...s, toPath: e.target.value })} /> : <div />}
      <TextInput label="Note interne" value={s.note} maxLength={200} onChange={(e) => setS({ ...s, note: e.target.value })} />
      <div><button type="submit" className={btn.primary} disabled={pending}>{row ? "Enregistrer" : "Créer la redirection"}</button></div>
    </form>
  );
}

export function RedirectsManager({ rows, isOwner }: { rows: RedirectRow[]; isOwner: boolean }) {
  const [edit, setEdit] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <Notice kind="info">Les redirections sont créées automatiquement quand vous changez l’adresse d’un contenu déjà publié. Les boucles sont refusées.</Notice>
      <Card title="Nouvelle redirection"><Form isOwner={isOwner} /></Card>
      <div className="overflow-x-auto rounded-sm border border-charcoal/15 bg-white">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Redirections</caption>
          <thead className="border-b border-charcoal/15 bg-offwhite text-xs uppercase tracking-wide"><tr><th scope="col" className="p-3">De</th><th scope="col" className="p-3">Vers</th><th scope="col" className="p-3">Code</th><th scope="col" className="p-3">Visites</th><th scope="col" className="p-3"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5} className="p-6 text-center text-charcoal/70">Aucune redirection.</td></tr> : null}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-charcoal/10 align-top last:border-0">
                <td className="p-3 font-mono text-xs">{r.fromPath}{r.auto ? <span className="ml-2 rounded-sm bg-beige/30 px-1 font-sans">auto</span> : null}</td>
                <td className="p-3 font-mono text-xs">{r.toPath ?? "—"}</td>
                <td className="p-3">{r.statusCode}</td>
                <td className="p-3">{r.hits}</td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={btn.secondary + " " + btn.small} aria-expanded={edit === r.id} onClick={() => setEdit(edit === r.id ? null : r.id)}>Modifier</button>
                    {isOwner ? <ActionButton variant="danger" run={() => deleteRedirectAction(r.id)} confirm={{ title: "Supprimer cette redirection ?", message: "Les anciens liens vers cette adresse renverront une erreur 404.", confirmLabel: "Supprimer", danger: true }}>Supprimer</ActionButton> : null}
                  </div>
                  {edit === r.id ? <div className="mt-3"><Form row={r} isOwner={isOwner} onDone={() => setEdit(null)} /></div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
