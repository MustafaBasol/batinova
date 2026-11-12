"use client";
import { useState } from "react";
import { createUserAction, resetPasswordAction, updateUserAction } from "@/app/admin/(panel)/_actions/admin";
import { Card, Notice, Select, TextInput, Toggle, btn, useRunner } from "./ui";

export interface UserRow { id: string; email: string; name: string; role: "OWNER" | "EDITOR"; active: boolean; lastLoginAt: string | null; isSelf: boolean }

function generatePassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789-_";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function CreateForm() {
  const { run, pending } = useRunner();
  const [s, setS] = useState({ email: "", name: "", role: "EDITOR", password: "" });
  const [fe, setFe] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<string | null>(null);
  return (
    <Card title="Créer un utilisateur">
      <form noValidate className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setFe({}); run(() => createUserAction(s), { onOk: () => { setShown(s.password); setS({ email: "", name: "", role: "EDITOR", password: "" }); }, onFail: (r) => setFe(r.fieldErrors ?? {}) }); }}>
        <TextInput label="Nom" required value={s.name} error={fe.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
        <TextInput label="Adresse e-mail (identifiant)" type="email" required value={s.email} error={fe.email} autoComplete="off" onChange={(e) => setS({ ...s, email: e.target.value })} />
        <Select label="Rôle" value={s.role} onChange={(e) => setS({ ...s, role: e.target.value })} options={[{ value: "EDITOR", label: "Éditeur — contenu, médias, demandes" }, { value: "OWNER", label: "Propriétaire — tous les droits" }]} help="Un éditeur gère le contenu mais ne peut ni modifier les réglages, ni gérer les utilisateurs, ni supprimer définitivement." />
        <div className="space-y-1">
          <TextInput label="Mot de passe initial (12 caractères minimum)" type="text" required value={s.password} error={fe.password} autoComplete="off" onChange={(e) => setS({ ...s, password: e.target.value })} />
          <button type="button" className={btn.ghost + " " + btn.small} onClick={() => setS({ ...s, password: generatePassword() })}>Générer un mot de passe</button>
        </div>
        <div><button type="submit" className={btn.primary} disabled={pending}>Créer le compte</button></div>
      </form>
      {shown ? <div className="mt-4"><Notice kind="warn">Transmettez ce mot de passe par un canal sûr (jamais par e-mail en clair) : <code className="font-mono">{shown}</code>. Il ne sera plus affiché. <button type="button" className="underline" onClick={() => setShown(null)}>Masquer</button></Notice></div> : null}
    </Card>
  );
}

function Row({ u }: { u: UserRow }) {
  const { run, pending } = useRunner();
  const [name, setName] = useState(u.name);
  const [role, setRole] = useState<string>(u.role);
  const [active, setActive] = useState(u.active);
  const [pw, setPw] = useState("");
  return (
    <li className="space-y-3 rounded-sm border border-charcoal/20 bg-white p-4">
      <p className="text-sm"><strong>{u.email}</strong>{u.isSelf ? " (vous)" : ""} · dernière connexion : {u.lastLoginAt ?? "jamais"}</p>
      <div className="grid gap-3 md:grid-cols-3">
        <TextInput label="Nom" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Rôle" value={role} onChange={(e) => setRole(e.target.value)} options={[{ value: "EDITOR", label: "Éditeur" }, { value: "OWNER", label: "Propriétaire" }]} />
        <div className="pt-6"><Toggle label="Compte actif" checked={active} onChange={setActive} hint="Désactiver ferme ses sessions." /></div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <button type="button" className={btn.primary} disabled={pending} onClick={() => run(() => updateUserAction({ id: u.id, name, role, active }))}>Enregistrer</button>
        <TextInput label="Nouveau mot de passe" type="text" value={pw} autoComplete="off" onChange={(e) => setPw(e.target.value)} hint="12 caractères minimum" />
        <button type="button" className={btn.secondary} disabled={pending || pw.length < 12} onClick={() => run(() => resetPasswordAction({ id: u.id, password: pw }), { onOk: () => setPw("") })}>Réinitialiser le mot de passe</button>
        <button type="button" className={btn.ghost} onClick={() => setPw(generatePassword())}>Générer</button>
      </div>
    </li>
  );
}

export function UsersManager({ users }: { users: UserRow[] }) {
  return (
    <div className="space-y-6">
      <Notice kind="info">Il doit toujours rester au moins un propriétaire actif. Les mots de passe ne sont jamais affichés après création.</Notice>
      <CreateForm />
      <ul className="space-y-4">{users.map((u) => <Row key={u.id} u={u} />)}</ul>
    </div>
  );
}
