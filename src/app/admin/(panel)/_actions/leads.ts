"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { anonymiseLead, deleteLeadPermanently, resendLeadNotification, saveLeadNotes, setLeadStatus } from "@/lib/cms/leads";
import { audit } from "@/lib/security/audit";
import { runRetentionPurge, type PurgeSummary } from "@/lib/maintenance";
import { runAction, type ActionResult } from "@/lib/cms/result";

/** Lead Server Actions (owner: cms-admin). EDITOR+: status / notes / resend. OWNER: anonymise, delete. */
export async function setLeadStatusAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => setLeadStatus(user, input), "Statut mis à jour.");
  if (r.ok) revalidatePath("/admin/demandes", "layout");
  return r;
}

export async function saveLeadNotesAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => saveLeadNotes(user, input), "Notes enregistrées.");
  if (r.ok) revalidatePath("/admin/demandes", "layout");
  return r;
}

export async function resendLeadAction(id: string): Promise<ActionResult<{ state: string }>> {
  const user = await requireRole("EDITOR");
  const r = await runAction(async () => ({ state: await resendLeadNotification(user, String(id)) }));
  if (r.ok) {
    revalidatePath("/admin/demandes", "layout");
    const state = r.data?.state;
    return state === "SENT"
      ? { ok: true, message: "Notification envoyée.", data: r.data }
      : state === "NOT_CONFIGURED"
        ? { ok: false, error: "L’envoi d’e-mails n’est pas configuré : la demande reste enregistrée ici uniquement." }
        : { ok: false, error: "L’envoi a échoué. Consultez l’état de l’e-mail sur la fiche." };
  }
  return r;
}

export async function anonymiseLeadAction(id: string): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const r = await runAction(() => anonymiseLead(user, String(id)), "Demande anonymisée.");
  if (r.ok) revalidatePath("/admin/demandes", "layout");
  return r;
}

export async function deleteLeadAction(id: string): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const r = await runAction(() => deleteLeadPermanently(user, String(id)), "Demande supprimée définitivement.");
  if (r.ok) revalidatePath("/admin/demandes", "layout");
  return r;
}

/** OWNER only: purge leads past their retention date (+ expired sessions / rate-limit buckets). */
export async function purgeExpiredLeadsAction(): Promise<ActionResult<PurgeSummary>> {
  const user = await requireRole("OWNER");
  const r = await runAction(async () => {
    const summary = await runRetentionPurge({ actorId: user.id });
    await audit(user.id, "maintenance.purge", { type: "Lead" }, { ...summary });
    return summary;
  });
  if (!r.ok) return r;
  revalidatePath("/admin/demandes", "layout");
  const n = r.data?.leads ?? 0;
  return {
    ...r,
    message: n === 0 ? "Aucune demande arrivée à échéance." : `${n} demande${n > 1 ? "s" : ""} purgée${n > 1 ? "s" : ""} définitivement.`,
  };
}
