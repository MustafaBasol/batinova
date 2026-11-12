import { z } from "zod";
import { db } from "@/lib/db";
import { isSafeInternalPath } from "@/lib/security/href";
import { CONTENT_STATUSES, type ContentStatusKey } from "./constants";
import { fromParisLocalInput } from "./datetime";
import { CmsError } from "./result";

/** Shared status / scheduling / SEO / media-alt rules (owner: cms-admin). */

export const StatusFields = z.object({
  status: z.enum(CONTENT_STATUSES),
  /** "YYYY-MM-DDTHH:mm" in Europe/Paris (datetime-local value). */
  scheduledAt: z.string().max(20).nullish(),
});

export interface PublicationState {
  status: ContentStatusKey;
  publishedAt: Date | null;
  scheduledAt: Date | null;
}

/**
 * Computes the stored publication fields.
 *  DRAFT/ARCHIVED : scheduledAt cleared, publishedAt kept (first publication date survives unpublishing)
 *  PUBLISHED      : publishedAt = existing ?? now, scheduledAt cleared
 *  SCHEDULED      : scheduledAt required, in the future (unless unchanged), publishedAt kept
 */
export function resolvePublication(
  current: PublicationState | null,
  input: { status: ContentStatusKey; scheduledAt?: string | null },
  now: Date = new Date(),
): PublicationState {
  const publishedAt = current?.publishedAt ?? null;
  switch (input.status) {
    case "DRAFT":
    case "ARCHIVED":
      return { status: input.status, publishedAt, scheduledAt: null };
    case "PUBLISHED":
      return { status: "PUBLISHED", publishedAt: publishedAt ?? now, scheduledAt: null };
    case "SCHEDULED": {
      const at = fromParisLocalInput(input.scheduledAt ?? "");
      if (!at) throw new CmsError("Indiquez la date et l’heure de publication programmée.", { scheduledAt: "Date requise (heure de Paris)." });
      const unchanged = current?.status === "SCHEDULED" && current.scheduledAt && Math.abs(current.scheduledAt.getTime() - at.getTime()) < 60_000;
      if (at.getTime() <= now.getTime() && !unchanged) {
        throw new CmsError("La date programmée doit être dans le futur.", { scheduledAt: "Choisissez une date future." });
      }
      return { status: "SCHEDULED", publishedAt, scheduledAt: at };
    }
  }
}

const emptyToNull = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const SeoFields = z.object({
  metaTitle: emptyToNull(120),
  metaDescription: emptyToNull(320),
  ogImageId: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9_-]*$/)
    .nullish()
    .transform((v) => (v ? v : null)),
  noindex: z.boolean().default(false),
  canonicalPath: emptyToNull(512).refine((v) => v === null || isSafeInternalPath(v), "Chemin invalide (commence par « / », sans espace)."),
});
export type SeoInput = z.infer<typeof SeoFields>;

export const optId = z
  .string()
  .max(64)
  .regex(/^[A-Za-z0-9_-]*$/)
  .nullish()
  .transform((v) => (v ? v : null));

/** Ensures referenced media exist and are not trashed; returns them. Never trusts client ids. */
export async function loadMediaOrThrow(ids: readonly (string | null | undefined)[], label = "image") {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (unique.length === 0) return new Map<string, { id: string; alt: string; originalName: string; deletedAt: Date | null }>();
  const rows = await db.media.findMany({ where: { id: { in: unique } }, select: { id: true, alt: true, originalName: true, deletedAt: true } });
  const map = new Map(rows.map((r) => [r.id, r]));
  for (const id of unique) {
    const r = map.get(id);
    if (!r || r.deletedAt) throw new CmsError(`Une ${label} sélectionnée n’existe plus ou est dans la corbeille.`);
  }
  return map;
}

/** Publishing gate: every referenced picture must have a user-facing alt text. */
export async function assertMediaAlt(ids: readonly (string | null | undefined)[]) {
  const map = await loadMediaOrThrow(ids);
  const missing = [...map.values()].filter((m) => !m.alt.trim());
  if (missing.length) {
    throw new CmsError(
      `Texte alternatif manquant pour : ${missing.map((m) => m.originalName).slice(0, 4).join(", ")}. Renseignez-le dans la médiathèque avant de publier.`,
      { media: "Texte alternatif requis pour publier." },
    );
  }
}

export const isLive = (status: ContentStatusKey) => status === "PUBLISHED" || status === "SCHEDULED";
