/**
 * Server-side resolution of the admin logo overrides (settings.branding.*MediaId).
 * Returns plain serialisable data so it can be passed as props to <Logo/> inside client components.
 * A missing / soft-deleted / unusable Media silently falls back to the official static files.
 */
import "server-only";
import { mediaUrl } from "@/lib/content/paths";
import { getMediaByIds } from "@/lib/content/public";
import { parseVariants } from "@/components/media/ResponsiveImage";
import { getSettings } from "@/lib/settings";
import type { LogoOverride, LogoOverrides } from "./brand-assets";

export async function resolveLogoOverrides(): Promise<LogoOverrides> {
  try {
    const { branding } = await getSettings();
    const ids = {
      color: branding.logoMediaId,
      mono: branding.logoMonoMediaId,
      onDark: branding.logoOnDarkMediaId,
    } as const;
    const wanted = Object.values(ids).filter((v): v is string => !!v);
    if (wanted.length === 0) return {};
    const media = await getMediaByIds(wanted);
    const out: LogoOverrides = {};
    for (const [variant, id] of Object.entries(ids) as [keyof typeof ids, string | null][]) {
      const m = id ? media.get(id) : undefined;
      if (!m || !m.width || !m.height) continue;
      const vs = parseVariants(m.variants);
      const set = (fmt: "avif" | "webp") =>
        vs
          .filter((v) => v.format === fmt)
          .sort((a, b) => a.width - b.width)
          .map((v) => ({ src: mediaUrl(v.key), width: v.width }));
      const o: LogoOverride = { src: mediaUrl(m.storageKey), width: m.width, height: m.height, avif: set("avif"), webp: set("webp") };
      out[variant] = o;
    }
    return out;
  } catch {
    return {};
  }
}
