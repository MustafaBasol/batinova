"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { anonymiseLeadAction, deleteLeadAction, resendLeadAction, saveLeadNotesAction, setLeadStatusAction } from "@/app/admin/(panel)/_actions/leads";
import { LEAD_STATUSES } from "@/lib/cms/constants";
import { LEAD_STATUS_LABELS } from "@/lib/leads/options";
import { ActionButton, Card, Select, TextArea, btn, useRunner } from "./ui";

export function LeadPanel({ id, status, notes, isOwner, mailState }: { id: string; status: string; notes: string; isOwner: boolean; mailState: string }) {
  const router = useRouter();
  const { run, pending } = useRunner();
  const [st, setSt] = useState(status);
  const [n, setN] = useState(notes);
  return (
    <div className="space-y-6">
      <Card title="Suivi">
        <div className="space-y-4">
          <Select label="Statut" value={st} onChange={(e) => { setSt(e.target.value); run(() => setLeadStatusAction({ id, status: e.target.value })); }} options={LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s] }))} help="Nouveau → Contacté → Devis envoyé → Gagné ou Perdu. « Indésirable » : spam (supprimé automatiquement après quelques jours). « Archivé » : traité." />
          <TextArea label="Notes internes" value={n} onChange={(e) => setN(e.target.value)} rows={5} maxLength={5000} counterMax={5000} hint="Jamais visibles du client. Évitez les informations sensibles inutiles." />
          <button type="button" disabled={pending} className={btn.primary} onClick={() => run(() => saveLeadNotesAction({ id, notes: n }))}>Enregistrer les notes</button>
        </div>
      </Card>
      <Card title="Notification e-mail">
        <p className="mb-3 text-sm">{mailState === "SENT" ? "La notification a été envoyée." : mailState === "FAILED" ? "L’envoi a échoué." : "Envoi non configuré : la demande n’est visible que dans cette interface."}</p>
        <ActionButton size="normal" run={() => resendLeadAction(id)}>Renvoyer la notification</ActionButton>
      </Card>
      {isOwner ? (
        <Card title="Données personnelles (RGPD)">
          <p className="mb-3 text-sm text-charcoal/80">Anonymiser conserve les statistiques (date, type de projet, région) et efface les données identifiantes et les pièces jointes. Supprimer efface tout.</p>
          <div className="flex flex-wrap gap-2">
            <ActionButton size="normal" run={() => anonymiseLeadAction(id)} confirm={{ title: "Anonymiser cette demande ?", message: "Nom, e-mail, téléphone, message, notes et pièces jointes seront effacés définitivement.", confirmLabel: "Anonymiser", danger: true }}>Anonymiser</ActionButton>
            <ActionButton size="normal" variant="danger" run={() => deleteLeadAction(id)} onOk={() => router.push("/admin/demandes")} confirm={{ title: "Supprimer définitivement cette demande ?", message: "Cette action est irréversible : la demande et ses fichiers sont effacés.", confirmLabel: "Supprimer définitivement", danger: true }}>Supprimer définitivement</ActionButton>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
