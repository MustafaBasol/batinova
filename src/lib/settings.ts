import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import {
  SETTINGS_SCHEMAS,
  SETTING_KEYS,
  defaultSettings,
  parseSetting,
  type SettingKey,
  type SiteSettings,
} from "@/lib/settings-schema";

export * from "@/lib/settings-schema";

/**
 * Server settings access (owner: architect-security).
 * getSettings(): all settings merged over defaults (request-deduplicated).
 * updateSetting(): validated write + audit — caller MUST have checked authorization
 * (OWNER for company/emailRouting/mail/analytics/leads; see docs/ARCHITECTURE.md).
 */
export const getSettings = cache(async (): Promise<SiteSettings> => {
  const rows = await db.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const out = defaultSettings();
  for (const row of rows) {
    const key = row.key as SettingKey;
    (out as Record<SettingKey, unknown>)[key] = parseSetting(key, row.value);
  }
  return out;
});

export async function getSetting<K extends SettingKey>(key: K): Promise<SiteSettings[K]> {
  const row = await db.setting.findUnique({ where: { key } });
  return parseSetting(key, row?.value);
}

export class SettingValidationError extends Error {
  constructor(
    public readonly key: SettingKey,
    public readonly issues: { path: string; message: string }[],
  ) {
    super(`Invalid setting "${key}"`);
  }
}

export async function updateSetting<K extends SettingKey>(
  key: K,
  value: unknown,
  actorId: string | null,
): Promise<SiteSettings[K]> {
  const res = SETTINGS_SCHEMAS[key].safeParse(value);
  if (!res.success) {
    throw new SettingValidationError(
      key,
      res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  const data = res.data as object;
  await db.setting.upsert({
    where: { key },
    create: { key, value: data, updatedById: actorId },
    update: { value: data, updatedById: actorId },
  });
  await audit(actorId, "settings.update", { type: "Setting", id: key });
  return res.data as SiteSettings[K];
}

/** Roles allowed to edit each settings group. */
export const SETTING_EDIT_ROLES: Record<SettingKey, readonly ("OWNER" | "EDITOR")[]> = {
  company: ["OWNER"],
  address: ["OWNER"],
  serviceAreas: ["OWNER", "EDITOR"],
  emailRouting: ["OWNER"],
  social: ["OWNER", "EDITOR"],
  leads: ["OWNER"],
  mail: ["OWNER"],
  seo: ["OWNER", "EDITOR"],
  analytics: ["OWNER"],
};
