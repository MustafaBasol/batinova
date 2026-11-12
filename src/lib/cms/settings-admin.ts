import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { SETTING_KEYS, SettingValidationError, updateSetting, type SettingKey } from "@/lib/settings";
import { CmsError } from "./result";

/** Settings writes (owner: cms-admin). OWNER only — stricter than SETTING_EDIT_ROLES on purpose. */
export async function saveSettingsGroup(actor: SessionUser, key: unknown, value: unknown): Promise<void> {
  if (actor.role !== "OWNER") throw new CmsError("Réservé au propriétaire.");
  const k = z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]).safeParse(key);
  if (!k.success) throw new CmsError("Groupe de réglages inconnu.");
  if (k.data === "analytics") {
    const a = value as { enabled?: boolean; provider?: string; id?: string } | null;
    if (a?.enabled && (a.provider === "none" || !a.id)) throw new CmsError("Choisissez un outil et saisissez son identifiant avant de l’activer.");
  }
  if (k.data === "seo") {
    const id = (value as { defaultOgImageId?: string | null } | null)?.defaultOgImageId;
    if (id && !(await db.media.findFirst({ where: { id, deletedAt: null }, select: { id: true } }))) throw new CmsError("Image de partage introuvable.");
  }
  if (k.data === "branding") {
    const b = (value ?? {}) as Record<string, unknown>;
    for (const f of ["logoMediaId", "logoMonoMediaId", "logoOnDarkMediaId"]) {
      const id = b[f];
      if (id === null || id === undefined) continue;
      if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new CmsError("Identifiant de logo invalide.", { [f]: "Média invalide." });
      const m = await db.media.findFirst({ where: { id, deletedAt: null }, select: { mime: true } });
      if (!m || !["image/png", "image/webp", "image/jpeg", "image/avif"].includes(m.mime)) {
        throw new CmsError("Le logo choisi n’existe plus, est dans la corbeille ou n’est pas une image.", { [f]: "Média introuvable ou non raster." });
      }
    }
  }
  try {
    await updateSetting(k.data, value, actor.id);
  } catch (err) {
    if (err instanceof SettingValidationError) {
      const fe: Record<string, string> = {};
      for (const i of err.issues) fe[i.path] ??= i.message;
      throw new CmsError("Certains réglages sont invalides.", fe);
    }
    throw err;
  }
}
