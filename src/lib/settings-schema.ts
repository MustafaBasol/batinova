/**
 * Typed site settings — schemas & defaults (owner: architect-security).
 * Isomorphic (no DB). Server access: src/lib/settings.ts.
 *
 * NO-INVENTION RULE: every business identifier defaults to "" with
 * verified:false. Public UI must only display a value when `isVerified(field)`
 * is true; otherwise show nothing or a clearly labelled placeholder.
 */
import { z } from "zod";
import { BASE_ADDRESS } from "@/lib/config/site";
import { isSafeHref } from "@/lib/security/href";

export const VerifiedText = z.object({
  value: z.string().trim().max(300).default(""),
  verified: z.boolean().default(false),
});
export type VerifiedText = z.infer<typeof VerifiedText>;
const vt = () => VerifiedText.default({ value: "", verified: false });

export const CompanySettings = z.object({
  legalName: vt(),
  tradeName: VerifiedText.default({ value: "BatiNova Construction", verified: false }),
  legalForm: vt(),
  siren: vt(),
  siret: vt(),
  rcs: vt(),
  tvaNumber: vt(),
  capital: vt(),
  director: vt(), // directeur de la publication
  phone: vt(),
  publicEmail: vt(),
  hostingProvider: vt(), // nom, adresse, téléphone de l'hébergeur (mentions légales)
  insurance: vt(), // assurance décennale — only if certificate verified
  privacyController: vt(),
});

export const AddressSettings = z.object({
  streetAddress: z.string().trim().max(200).default(BASE_ADDRESS.streetAddress),
  postalCode: z.string().trim().max(10).default(BASE_ADDRESS.postalCode),
  addressLocality: z.string().trim().max(120).default(BASE_ADDRESS.addressLocality),
  addressRegion: z.string().trim().max(120).default(BASE_ADDRESS.addressRegion),
  addressCountry: z.string().trim().length(2).default(BASE_ADDRESS.addressCountry),
  /** "user-supplied" = provided by the owner, not independently validated. */
  source: z.enum(["user-supplied", "owner-verified"]).default("user-supplied"),
  /** Single head office: no branch offices are modelled on purpose. */
  showOnSite: z.boolean().default(true),
});

export const ServiceAreaSettings = z.object({
  areas: z
    .array(
      z.object({
        code: z.enum(["ILE_DE_FRANCE", "NORMANDIE", "MANCHE"]),
        enabled: z.boolean(),
        highlighted: z.boolean(),
        note: z.string().trim().max(300).default(""),
      }),
    )
    .default([
      { code: "ILE_DE_FRANCE", enabled: true, highlighted: false, note: "" },
      { code: "NORMANDIE", enabled: true, highlighted: false, note: "" },
      { code: "MANCHE", enabled: true, highlighted: true, note: "" },
    ]),
});

const mailbox = (address: string) =>
  z
    .object({
      address: z.string().trim().max(254).default(address),
      /** true only once the mailbox / alias really exists and MX is verified. */
      provisioned: z.boolean().default(false),
    })
    .default({ address, provisioned: false });

export const EmailRoutingSettings = z.object({
  contact: mailbox("contact@btnv.fr"),
  devis: mailbox("devis@btnv.fr"),
  projets: mailbox("projets@btnv.fr"),
  direction: mailbox("direction@btnv.fr"),
  privacy: mailbox("privacy@btnv.fr"),
  /** Which mailbox receives new-lead notifications. */
  leadNotificationTarget: z.enum(["contact", "devis", "projets", "direction"]).default("devis"),
});

const socialUrl = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || (v.startsWith("https://") && isSafeHref(v)), "URL https requise")
  .default("");

export const SocialSettings = z.object({
  linkedin: socialUrl,
  instagram: socialUrl,
  facebook: socialUrl,
  youtube: socialUrl,
  houzz: socialUrl,
  googleBusinessProfile: socialUrl, // only once owner-verified
});

export const LeadSettings = z.object({
  /** CNIL guidance for prospects: 3 years from last contact. TO BE CONFIRMED by owner/legal. */
  retentionDays: z.number().int().min(30).max(3650).default(1095),
  retentionConfirmed: z.boolean().default(false),
  /** Spam / SPAM-status leads are purged sooner. */
  spamRetentionDays: z.number().int().min(1).max(365).default(30),
  consentTextVersion: z.string().trim().max(40).default("2026-11-v1"),
  attachmentsEnabled: z.boolean().default(false),
});

export const MailSettings = z.object({
  /** Master switch; SMTP env vars must ALSO be present. */
  enabled: z.boolean().default(false),
});

export const SeoSettings = z.object({
  /** Google Search Console HTML-tag token (content attribute only). */
  googleSiteVerification: z
    .string()
    .trim()
    .max(200)
    .regex(/^[A-Za-z0-9_-]*$/, "Jeton invalide")
    .default(""),
  defaultOgImageId: z.string().max(64).nullable().default(null),
  defaultMetaDescription: z.string().trim().max(300).default(""),
});

export const AnalyticsSettings = z.object({
  provider: z.enum(["none", "plausible", "ga4"]).default("none"),
  id: z.string().trim().max(120).default(""),
  enabled: z.boolean().default(false),
  /** Analytics must never load before consent when true. Cannot be disabled for ga4. */
  requiresConsent: z.boolean().default(true),
});

export const SETTINGS_SCHEMAS = {
  company: CompanySettings,
  address: AddressSettings,
  serviceAreas: ServiceAreaSettings,
  emailRouting: EmailRoutingSettings,
  social: SocialSettings,
  leads: LeadSettings,
  mail: MailSettings,
  seo: SeoSettings,
  analytics: AnalyticsSettings,
} as const;

export type SettingKey = keyof typeof SETTINGS_SCHEMAS;
export const SETTING_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingKey[];
export type SiteSettings = { [K in SettingKey]: z.infer<(typeof SETTINGS_SCHEMAS)[K]> };

export function defaultSettings(): SiteSettings {
  const out = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) out[key] = SETTINGS_SCHEMAS[key].parse({});
  return out as SiteSettings;
}

/** Parse one stored value; invalid/missing values fall back to defaults. */
export function parseSetting<K extends SettingKey>(key: K, value: unknown): SiteSettings[K] {
  const schema = SETTINGS_SCHEMAS[key];
  const res = schema.safeParse(value ?? {});
  return (res.success ? res.data : schema.parse({})) as SiteSettings[K];
}

export function isVerified(field: VerifiedText | undefined | null): field is VerifiedText {
  return !!field && field.verified && field.value.trim().length > 0;
}

/** Analytics may load only if enabled, configured and (when required) consented. */
export function analyticsAllowed(a: SiteSettings["analytics"], hasConsent: boolean): boolean {
  if (!a.enabled || a.provider === "none" || !a.id) return false;
  const consentNeeded = a.provider === "ga4" ? true : a.requiresConsent;
  return consentNeeded ? hasConsent : true;
}
