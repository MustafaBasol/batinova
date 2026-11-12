/**
 * Lead input validation (owner: architect-security). Isomorphic so the form can
 * reuse it client-side for UX, but the server ALWAYS re-validates.
 */
import { z } from "zod";
import { BUDGET_RANGES, LEAD_REGIONS, PROJECT_TYPES, TIMELINES } from "./options";

const keys = <T extends Record<string, string>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];
const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Field names used by the public form (FormData keys). */
export const LEAD_FIELDS = [
  "name",
  "email",
  "phone",
  "postalCode",
  "city",
  "region",
  "projectType",
  "message",
  "budgetRange",
  "desiredTimeline",
  "desiredStartDate",
  "source",
  "consent",
  "website", // honeypot — must stay empty (visually hidden, aria-hidden, tabIndex -1)
  "formStartedAt", // ms timestamp set when the form renders (anti-bot minimum fill time)
] as const;

export const LeadInputSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom.").max(120),
  email: z.email("Adresse e-mail invalide.").trim().toLowerCase().max(254),
  phone: z.preprocess(
    emptyToUndef,
    z
      .string()
      .trim()
      .regex(/^\+?[0-9 .\-()]{6,25}$/, "Numéro de téléphone invalide.")
      .optional(),
  ),
  postalCode: z.string().trim().regex(/^(?:0[1-9]|[1-8]\d|9[0-8])\d{3}$/, "Code postal français à 5 chiffres."),
  city: z.preprocess(emptyToUndef, z.string().trim().max(120).optional()),
  region: z.preprocess(emptyToUndef, z.enum(keys(LEAD_REGIONS)).optional()),
  projectType: z.enum(keys(PROJECT_TYPES), "Choisissez un type de projet."),
  message: z.string().trim().min(10, "Décrivez votre projet en quelques mots.").max(5000),
  budgetRange: z.preprocess(emptyToUndef, z.enum(keys(BUDGET_RANGES)).optional()),
  desiredTimeline: z.preprocess(emptyToUndef, z.enum(keys(TIMELINES)).optional()),
  desiredStartDate: z.preprocess(emptyToUndef, z.string().trim().max(40).optional()),
  source: z.preprocess(
    emptyToUndef,
    z
      .string()
      .regex(/^[a-z0-9:_-]{1,60}$/)
      .optional(),
  ),
  consent: z.preprocess(
    (v) => v === true || v === "on" || v === "true",
    z.literal(true, "Votre accord est nécessaire pour traiter la demande."),
  ),
  website: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string().max(500)),
  formStartedAt: z.preprocess((v) => (v == null || v === "" ? undefined : Number(v)), z.number().optional()),
});

export type LeadInput = z.infer<typeof LeadInputSchema>;

/** Derives the stored Region enum (OTHER -> null) and, if absent, a guess from the postal code. */
export function regionFromInput(region: string | undefined, postalCode: string): "ILE_DE_FRANCE" | "NORMANDIE" | "MANCHE" | null {
  if (region === "ILE_DE_FRANCE" || region === "NORMANDIE" || region === "MANCHE") return region;
  if (region === "OTHER") return null;
  const dep = postalCode.slice(0, 2);
  if (["75", "77", "78", "91", "92", "93", "94", "95"].includes(dep)) return "ILE_DE_FRANCE";
  if (dep === "50") return "MANCHE";
  if (["14", "27", "61", "76"].includes(dep)) return "NORMANDIE";
  return null;
}
