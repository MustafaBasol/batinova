/**
 * Lead form vocabularies & privacy notice (owner: architect-security).
 * Isomorphic. Stored values are the keys; labels are French UI strings.
 * Changing CONSENT_TEXT requires bumping CONSENT_TEXT_VERSION (and the
 * `leads.consentTextVersion` setting) so each lead records what was accepted.
 */
export const PROJECT_TYPES = {
  renovation: "Rénovation",
  extension: "Extension",
  construction: "Construction neuve",
  amenagement: "Aménagement intérieur",
  gros_oeuvre: "Gros œuvre / structure",
  autre: "Autre projet",
} as const;

export const BUDGET_RANGES = {
  lt_20k: "Moins de 20 000 €",
  "20k_50k": "20 000 € à 50 000 €",
  "50k_100k": "50 000 € à 100 000 €",
  "100k_250k": "100 000 € à 250 000 €",
  gt_250k: "Plus de 250 000 €",
  unknown: "Je ne sais pas encore",
} as const;

export const TIMELINES = {
  asap: "Dès que possible",
  "3_months": "Dans les 3 mois",
  "6_months": "Dans les 6 mois",
  "12_months": "Dans l’année",
  undecided: "Pas encore défini",
} as const;

export const LEAD_REGIONS = {
  ILE_DE_FRANCE: "Île-de-France",
  NORMANDIE: "Normandie (hors Manche)",
  MANCHE: "Manche",
  OTHER: "Autre",
} as const;

export const LEAD_STATUS_LABELS = {
  NEW: "Nouveau",
  CONTACTED: "Contacté",
  QUOTED: "Devis envoyé",
  WON: "Gagné",
  LOST: "Perdu",
  SPAM: "Indésirable",
  ARCHIVED: "Archivé",
} as const;

export type ProjectTypeKey = keyof typeof PROJECT_TYPES;
export type BudgetRangeKey = keyof typeof BUDGET_RANGES;
export type TimelineKey = keyof typeof TIMELINES;

export const CONSENT_TEXT_VERSION = "2026-11-v1";

/**
 * Checkbox label + short notice shown next to the form. DRAFT pending owner /
 * legal review (controller identity is not yet verified).
 */
export const CONSENT_CHECKBOX_LABEL =
  "J’accepte que les informations saisies soient utilisées pour traiter ma demande de devis ou de contact.";

export const PRIVACY_NOTICE_SHORT =
  "Les données de ce formulaire sont utilisées uniquement par BatiNova Construction pour répondre à votre demande " +
  "(base légale : mesures précontractuelles à votre demande). Elles sont conservées au maximum 3 ans après le dernier contact, " +
  "sauf relation contractuelle. Vous pouvez exercer vos droits d’accès, de rectification, d’effacement, de limitation et " +
  "d’opposition en écrivant à l’adresse indiquée dans la politique de confidentialité, et introduire une réclamation auprès de la CNIL.";
