/**
 * Static site identity (owner: architect-security). Safe to import from client
 * and server code. Editable business data (phone, legal identity, emails…)
 * lives in DB settings — see src/lib/settings.ts — not here.
 */

function normalizeSiteUrl(raw: string | undefined): string {
  const fallback = "https://btnv.fr";
  if (!raw) return fallback;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return fallback;
    return u.origin; // strips path / trailing slash
  } catch {
    return fallback;
  }
}

/** Canonical origin, no trailing slash. Production must use https://btnv.fr. */
export const SITE_URL = normalizeSiteUrl(process.env.SITE_URL);

export const SITE = {
  name: "BatiNova Construction",
  shortName: "BatiNova",
  slogan: "Construire autrement.",
  domain: "btnv.fr",
  locale: "fr-FR",
  ogLocale: "fr_FR",
  htmlLang: "fr",
  timezone: "Europe/Paris",
  logoReference: "assets/batinova-logo-reference.jpeg",
} as const;

/**
 * Base address as SUPPLIED BY THE OWNER — not independently validated.
 * Single head office: there are NO branch offices in Normandie / Manche.
 */
export const BASE_ADDRESS = {
  streetAddress: "4 rue des Lilas",
  postalCode: "93600",
  addressLocality: "Aulnay-sous-Bois",
  addressRegion: "Île-de-France",
  addressCountry: "FR",
  countryName: "France",
  source: "user-supplied" as const,
  verified: false,
} as const;

export type ServiceAreaCode = "ILE_DE_FRANCE" | "NORMANDIE" | "MANCHE";

export interface ServiceArea {
  code: ServiceAreaCode;
  name: string;
  /** Zone page path (CMS Page.path) — the page must exist AND be published to be linked. */
  path: string;
  kind: "region" | "department";
  /** For departments: parent region code. */
  parent?: ServiceAreaCode;
  highlighted: boolean;
}

/** Regions served from the single Aulnay-sous-Bois base (no local offices). */
export const SERVICE_AREAS: readonly ServiceArea[] = [
  { code: "ILE_DE_FRANCE", name: "Île-de-France", path: "zones-intervention/ile-de-france", kind: "region", highlighted: false },
  { code: "NORMANDIE", name: "Normandie", path: "zones-intervention/normandie", kind: "region", highlighted: false },
  { code: "MANCHE", name: "Manche", path: "zones-intervention/manche", kind: "department", parent: "NORMANDIE", highlighted: true },
] as const;

export const REGION_LABELS: Record<ServiceAreaCode, string> = {
  ILE_DE_FRANCE: "Île-de-France",
  NORMANDIE: "Normandie",
  MANCHE: "Manche (Normandie)",
};

/** Build an absolute URL on the canonical origin from a path ("" or "/x" or "x"). */
export function absoluteUrl(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${p === "/" ? "" : p}` || SITE_URL;
}
