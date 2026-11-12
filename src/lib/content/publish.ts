/**
 * THE single publication rule (owner: architect-security). Used by every public
 * query, sitemap, feeds and previews-guard. Do not re-implement elsewhere.
 *
 * A Page / Post / Project is public when ALL hold:
 *  - deletedAt IS NULL (not in the "corbeille")
 *  - status = PUBLISHED and (publishedAt IS NULL or publishedAt <= now), OR
 *  - status = SCHEDULED and scheduledAt <= now (or, when scheduledAt is null, publishedAt <= now)
 * DRAFT and ARCHIVED are never public.
 *
 * Scheduled content becomes visible at request time without a cron job; pages
 * using it must therefore be dynamic or revalidated (see docs/ARCHITECTURE.md).
 */

export type ContentStatusValue = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";

/** Prisma `where` fragment, structurally compatible with Page/Post/Project WhereInput. */
export function publishedWhere(now: Date = new Date()) {
  return {
    deletedAt: null,
    OR: [
      { status: "PUBLISHED" as const, OR: [{ publishedAt: null }, { publishedAt: { lte: now } }] },
      { status: "SCHEDULED" as const, scheduledAt: { lte: now } },
      { status: "SCHEDULED" as const, scheduledAt: null, publishedAt: { lte: now } },
    ],
  };
}

export interface PublishableFields {
  status: ContentStatusValue;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  deletedAt?: Date | null;
}

/** In-memory equivalent of publishedWhere (single record checks, tests). */
export function isPubliclyVisible(row: PublishableFields, now: Date = new Date()): boolean {
  if (row.deletedAt) return false;
  const t = now.getTime();
  if (row.status === "PUBLISHED") return !row.publishedAt || row.publishedAt.getTime() <= t;
  if (row.status === "SCHEDULED") {
    if (row.scheduledAt) return row.scheduledAt.getTime() <= t;
    return !!row.publishedAt && row.publishedAt.getTime() <= t;
  }
  return false;
}

/** Date to display / use in sitemaps & JSON-LD as the publication date. */
export function effectivePublishedAt(row: Pick<PublishableFields, "publishedAt" | "scheduledAt">): Date | null {
  return row.publishedAt ?? row.scheduledAt ?? null;
}

/** Soft-delete filter for non-publishable models (Media, Category, Tag). */
export const notDeleted = { deletedAt: null } as const;
