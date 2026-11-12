/** Isomorphic constants & French labels for the admin UI (owner: cms-admin). */
export const CONTENT_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHED", "ARCHIVED"] as const;
export type ContentStatusKey = (typeof CONTENT_STATUSES)[number];
export const STATUS_LABELS: Record<ContentStatusKey, string> = {
  DRAFT: "Brouillon",
  SCHEDULED: "Programmé",
  PUBLISHED: "Publié",
  ARCHIVED: "Archivé",
};

export const PAGE_TEMPLATES = ["HOME", "STANDARD", "SERVICE", "ZONE", "LEGAL", "CONTACT"] as const;
export type PageTemplateKey = (typeof PAGE_TEMPLATES)[number];
export const TEMPLATE_LABELS: Record<PageTemplateKey, string> = {
  HOME: "Accueil",
  STANDARD: "Page standard",
  SERVICE: "Service",
  ZONE: "Zone d’intervention",
  LEGAL: "Page légale",
  CONTACT: "Contact",
};
/** Suggested path prefix per template (admin convenience only). */
export const TEMPLATE_PREFIX: Partial<Record<PageTemplateKey, string>> = {
  SERVICE: "services/",
  ZONE: "zones-intervention/",
};

export const LICENSE_TYPES = ["OWNED", "LICENSED", "STOCK_FREE", "PLACEHOLDER", "UNKNOWN"] as const;
export type LicenseTypeKey = (typeof LICENSE_TYPES)[number];
export const LICENSE_LABELS: Record<LicenseTypeKey, string> = {
  OWNED: "Photo propre à l’entreprise",
  LICENSED: "Sous licence (achetée / accordée)",
  STOCK_FREE: "Banque d’images libre de droits",
  PLACEHOLDER: "Image de démonstration",
  UNKNOWN: "Licence inconnue",
};

export const REGIONS = ["ILE_DE_FRANCE", "NORMANDIE", "MANCHE"] as const;
export type RegionKey = (typeof REGIONS)[number];
export const REGION_NAMES: Record<RegionKey, string> = {
  ILE_DE_FRANCE: "Île-de-France",
  NORMANDIE: "Normandie",
  MANCHE: "Manche",
};

export const PROJECT_MEDIA_ROLES = ["GALLERY", "BEFORE", "AFTER"] as const;
export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUOTED", "WON", "LOST", "SPAM", "ARCHIVED"] as const;
export const NAV_LOCATIONS = ["HEADER", "FOOTER_PRIMARY", "FOOTER_LEGAL"] as const;
export type NavLocationKey = (typeof NAV_LOCATIONS)[number];
export const NAV_LOCATION_LABELS: Record<NavLocationKey, string> = {
  HEADER: "En-tête (menu principal)",
  FOOTER_PRIMARY: "Pied de page — navigation",
  FOOTER_LEGAL: "Pied de page — mentions légales",
};

export const REDIRECT_CODES = [301, 302, 308, 410] as const;

export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

export const TRASH_KINDS = ["page", "post", "project", "media", "category", "tag"] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];
export const TRASH_KIND_LABELS: Record<TrashKind, string> = {
  page: "Page",
  post: "Article",
  project: "Réalisation",
  media: "Média",
  category: "Catégorie",
  tag: "Étiquette",
};
