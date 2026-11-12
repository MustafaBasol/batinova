/**
 * JSON-LD builders (owner: seo-content). Pure functions, no I/O.
 *
 * FACT POLICY: only data that exists in the settings / content and is marked
 * verified (or owner-entered for social URLs) is emitted. Never emitted: ratings,
 * reviews, opening hours, founding date, geo coordinates, price ranges.
 *
 * LocalBusiness subtype: `HomeAndConstructionBusiness` (schema.org: "a construction
 * business" under LocalBusiness). It is the conservative parent of `GeneralContractor`;
 * we do not assert the narrower "general contractor" trade until the owner confirms
 * the exact activity/qualifications. The address is the single head office supplied by
 * the owner (not independently validated); there are no branch offices.
 */
import { SERVICE_AREAS, SITE, SITE_URL, absoluteUrl } from "@/lib/config/site";
import { ORG_LOGO } from "@/components/site/brand-assets";
import { isVerified, type SiteSettings } from "@/lib/settings-schema";
import type { Crumb } from "@/components/site/breadcrumbs";
import { truncateDescription } from "./metadata";

export type JsonLdNode = Record<string, unknown>;

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

const CONTEXT = "https://schema.org";

export function orgLogoObject(): JsonLdNode {
  return {
    "@type": "ImageObject",
    url: absoluteUrl(ORG_LOGO.src),
    width: ORG_LOGO.width,
    height: ORG_LOGO.height,
  };
}

export function buildAreaServed(settings: Pick<SiteSettings, "serviceAreas">): JsonLdNode[] {
  const enabled = new Set(settings.serviceAreas.areas.filter((a) => a.enabled).map((a) => a.code));
  const normandie = { "@type": "AdministrativeArea", name: "Normandie" };
  const out: JsonLdNode[] = [];
  for (const a of SERVICE_AREAS) {
    if (!enabled.has(a.code)) continue;
    if (a.code === "MANCHE") out.push({ "@type": "AdministrativeArea", name: "Manche", containedInPlace: normandie });
    else out.push({ "@type": "AdministrativeArea", name: a.name });
  }
  return out;
}

export function buildOrganization(settings: SiteSettings): JsonLdNode {
  const { company, address, social } = settings;
  const node: JsonLdNode = {
    "@type": ["Organization", "HomeAndConstructionBusiness"],
    "@id": ORG_ID,
    name: SITE.name,
    url: SITE_URL,
    logo: orgLogoObject(),
    slogan: SITE.slogan,
    areaServed: buildAreaServed(settings),
  };
  if (isVerified(company.legalName)) node.legalName = company.legalName.value;
  if (address.showOnSite) {
    node.address = {
      "@type": "PostalAddress",
      streetAddress: address.streetAddress,
      postalCode: address.postalCode,
      addressLocality: address.addressLocality,
      addressRegion: address.addressRegion,
      addressCountry: address.addressCountry,
    };
  }
  if (isVerified(company.phone)) node.telephone = company.phone.value;
  if (isVerified(company.publicEmail)) node.email = company.publicEmail.value;
  const sameAs = Object.values(social).filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
  if (sameAs.length) node.sameAs = sameAs;
  return node;
}

export function buildWebSite(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: SITE.name,
    inLanguage: SITE.locale,
    publisher: { "@id": ORG_ID },
  };
}

export function buildBreadcrumbList(crumbs: Crumb[]): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}

export interface ArticleInput {
  title: string;
  description?: string | null;
  /** Site path of the canonical URL. */
  path: string;
  imageUrl?: string | null;
  publishedAt?: Date | string | null;
  modifiedAt?: Date | string | null;
  authorDisplayName?: string | null;
  section?: string | null;
  keywords?: string[];
  wordCount?: number | null;
}

const TEAM_RE = /batinova|[eé]quipe|r[eé]daction/i;
const isoDate = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : undefined);

export function buildArticle(a: ArticleInput): JsonLdNode {
  const author: JsonLdNode =
    a.authorDisplayName && !TEAM_RE.test(a.authorDisplayName)
      ? { "@type": "Person", name: a.authorDisplayName }
      : { "@type": "Organization", "@id": ORG_ID, name: SITE.name, url: SITE_URL };
  const node: JsonLdNode = {
    "@type": "BlogPosting",
    headline: a.title.length > 110 ? truncateDescription(a.title, 110) : a.title,
    description: a.description || undefined,
    mainEntityOfPage: { "@type": "WebPage", "@id": absoluteUrl(a.path) },
    url: absoluteUrl(a.path),
    inLanguage: SITE.locale,
    image: a.imageUrl ? [a.imageUrl] : undefined,
    datePublished: isoDate(a.publishedAt),
    dateModified: isoDate(a.modifiedAt ?? a.publishedAt),
    author,
    publisher: { "@type": "Organization", "@id": ORG_ID, name: SITE.name, url: SITE_URL, logo: orgLogoObject() },
    articleSection: a.section || undefined,
    keywords: a.keywords?.length ? a.keywords.join(", ") : undefined,
    wordCount: a.wordCount || undefined,
  };
  return stripUndefined(node);
}

export interface ServiceInput {
  name: string;
  description?: string | null;
  path: string;
  isPlaceholder?: boolean;
}

/** Service node, or null while the service copy is still placeholder content (not confirmed by the owner). */
export function buildService(s: ServiceInput, settings: Pick<SiteSettings, "serviceAreas">): JsonLdNode | null {
  if (s.isPlaceholder) return null;
  return stripUndefined({
    "@type": "Service",
    name: s.name,
    description: s.description || undefined,
    url: absoluteUrl(s.path),
    inLanguage: SITE.locale,
    provider: { "@id": ORG_ID },
    areaServed: buildAreaServed(settings),
  });
}

export function graph(...nodes: (JsonLdNode | null | undefined)[]): JsonLdNode {
  return { "@context": CONTEXT, "@graph": nodes.filter((n): n is JsonLdNode => !!n) };
}

function stripUndefined<T extends JsonLdNode>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/** Serialises JSON-LD safely for inline <script> (escapes <, >, &, U+2028/9). */
export function serializeJsonLd(data: unknown): string {
  const esc = (code: number) => "\\u" + code.toString(16).padStart(4, "0");
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (ch) => esc(ch.charCodeAt(0)));
}
