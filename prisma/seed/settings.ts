// Settings seed — owner: architect-security. Create-if-missing only.
import { SETTING_KEYS, defaultSettings } from "../../src/lib/settings-schema";
import type { SeedContext } from "./client";

export async function seedSettings({ db, log }: SeedContext): Promise<void> {
  const defaults = defaultSettings();
  let created = 0;
  for (const key of SETTING_KEYS) {
    const existing = await db.setting.findUnique({ where: { key } });
    if (existing) continue;
    await db.setting.create({ data: { key, value: defaults[key] as object } });
    created++;
  }
  log(`settings: ${created} created, ${SETTING_KEYS.length - created} kept`);
}
