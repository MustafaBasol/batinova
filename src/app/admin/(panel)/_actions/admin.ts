"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { runAction, type ActionResult } from "@/lib/cms/result";
import { saveSettingsGroup } from "@/lib/cms/settings-admin";
import { createUser, resetUserPassword, updateUser } from "@/lib/cms/users";

/** OWNER-only Server Actions: users and settings (owner: cms-admin). */
export async function saveSettingsAction(key: string, value: unknown): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const r = await runAction(() => saveSettingsGroup(user, key, value), "Réglages enregistrés.");
  if (r.ok) revalidatePath("/", "layout");
  return r;
}

export async function createUserAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("OWNER");
  const r = await runAction(() => createUser(user, input), "Utilisateur créé.");
  if (r.ok) revalidatePath("/admin/utilisateurs");
  return r;
}

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const r = await runAction(() => updateUser(user, input), "Utilisateur mis à jour.");
  if (r.ok) revalidatePath("/admin/utilisateurs");
  return r;
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const r = await runAction(() => resetUserPassword(user, input), "Mot de passe réinitialisé ; les sessions de cet utilisateur ont été fermées.");
  if (r.ok) revalidatePath("/admin/utilisateurs");
  return r;
}
