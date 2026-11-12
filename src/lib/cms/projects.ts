import { z } from "zod";
import { db } from "@/lib/db";
import type { Project } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { BlocksSchema, collectMediaIds } from "@/lib/blocks/schema";
import { projectUrl } from "@/lib/content/paths";
import { audit } from "@/lib/security/audit";
import { REGIONS } from "./constants";
import { assertMediaAlt, isLive, loadMediaOrThrow, optId, resolvePublication, SeoFields, StatusFields } from "./publication";
import { clearRedirectFrom, recordMove } from "./redirects";
import { CmsError, parseOrThrow } from "./result";
import { addRevision } from "./revisions";
import { assertSlugAvailable, uniqueSlug } from "./slugs";

/**
 * Project mutations (owner: cms-admin).
 * Gallery persistence in ProjectMedia: plain gallery images = role GALLERY, sortOrder 0..n-1.
 * Before/after pair i = one BEFORE row + one AFTER row sharing sortOrder (100 + i).
 */
export const PAIR_SORT_BASE = 100;

const mid = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const ProjectInputSchema = z
  .object({
    id: z.string().max(64).optional(),
    title: z.string().trim().min(1, "Titre requis").max(160),
    slug: z.string().max(200).default(""),
    summary: z.string().trim().max(600).nullish(),
    region: z.enum(REGIONS).nullish(),
    locationLabel: z.string().trim().max(120).nullish(),
    blocks: z.unknown(),
    coverImageId: optId,
    sortOrder: z.number().int().min(0).max(10_000).default(0),
    isPlaceholder: z.boolean().default(false),
    gallery: z.array(mid).max(60).default([]),
    pairs: z.array(z.object({ beforeId: mid, afterId: mid })).max(20).default([]),
  })
  .extend(StatusFields.shape)
  .extend(SeoFields.shape);

function snapshotOf(p: Project, gallery: string[], pairs: { beforeId: string; afterId: string }[]) {
  return {
    title: p.title, slug: p.slug, summary: p.summary, region: p.region, locationLabel: p.locationLabel, blocks: p.blocks,
    coverImageId: p.coverImageId, sortOrder: p.sortOrder, isPlaceholder: p.isPlaceholder, status: p.status, gallery, pairs,
    metaTitle: p.metaTitle, metaDescription: p.metaDescription, ogImageId: p.ogImageId, noindex: p.noindex, canonicalPath: p.canonicalPath,
  };
}

export async function saveProject(actor: SessionUser, raw: unknown, now: Date = new Date()): Promise<{ id: string; slug: string }> {
  const input = parseOrThrow(ProjectInputSchema, raw);
  const blocksRes = BlocksSchema.safeParse(input.blocks ?? []);
  if (!blocksRes.success) {
    const fe: Record<string, string> = {};
    for (const i of blocksRes.error.issues) fe[`block:${typeof i.path[0] === "number" ? i.path[0] : -1}`] ??= `${i.path.slice(1).join(".") || "bloc"} : ${i.message}`;
    throw new CmsError("Certains blocs sont incomplets ou invalides.", fe);
  }
  const blocks = blocksRes.data;
  const existing = input.id ? await db.project.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) throw new CmsError("Réalisation introuvable.");
  if (existing?.deletedAt) throw new CmsError("Cette réalisation est dans la corbeille : restaurez-la avant de la modifier.");

  const slug = input.slug.trim() ? await assertSlugAvailable("project", input.slug, existing?.id) : await uniqueSlug("project", input.title, existing?.id);
  const pairIds = input.pairs.flatMap((p) => [p.beforeId, p.afterId]);
  const allMedia = [...input.gallery, ...pairIds, input.coverImageId, input.ogImageId, ...collectMediaIds(blocks)];
  await loadMediaOrThrow(allMedia);
  const pub = resolvePublication(existing, input, now);
  if (isLive(pub.status)) await assertMediaAlt(allMedia);

  const data = {
    slug,
    title: input.title,
    summary: input.summary || null,
    region: input.region ?? null,
    locationLabel: input.locationLabel || null,
    blocks: blocks as unknown as object,
    coverImageId: input.coverImageId,
    sortOrder: input.sortOrder,
    isPlaceholder: input.isPlaceholder,
    status: pub.status,
    publishedAt: pub.publishedAt,
    scheduledAt: pub.scheduledAt,
    metaTitle: input.metaTitle,
    metaDescription: input.metaDescription,
    ogImageId: input.ogImageId,
    noindex: input.noindex,
    canonicalPath: input.canonicalPath,
    updatedById: actor.id,
  };
  const project = existing ? await db.project.update({ where: { id: existing.id }, data }) : await db.project.create({ data });
  if (existing && existing.slug !== slug) {
    if (existing.status !== "DRAFT" || existing.publishedAt) await recordMove(projectUrl(existing.slug), projectUrl(slug), actor.id);
    else await clearRedirectFrom(projectUrl(slug));
  } else if (!existing) await clearRedirectFrom(projectUrl(slug));

  const rows: { projectId: string; mediaId: string; role: "GALLERY" | "BEFORE" | "AFTER"; sortOrder: number }[] = [];
  const seen = new Set<string>();
  input.gallery.forEach((mediaId, i) => {
    if (!seen.has(mediaId)) rows.push({ projectId: project.id, mediaId, role: "GALLERY", sortOrder: i });
    seen.add(mediaId);
  });
  input.pairs.forEach((p, i) => {
    rows.push({ projectId: project.id, mediaId: p.beforeId, role: "BEFORE", sortOrder: PAIR_SORT_BASE + i });
    rows.push({ projectId: project.id, mediaId: p.afterId, role: "AFTER", sortOrder: PAIR_SORT_BASE + i });
  });
  await db.projectMedia.deleteMany({ where: { projectId: project.id } });
  if (rows.length) await db.projectMedia.createMany({ data: rows });

  await addRevision("project", project.id, snapshotOf(project, input.gallery, input.pairs), actor.id);
  const verb = existing
    ? existing.status !== project.status && isLive(project.status) ? "publish" : existing.status !== project.status && isLive(existing.status) ? "unpublish" : "update"
    : "create";
  await audit(actor.id, `project.${verb}`, { type: "Project", id: project.id }, { slug: project.slug, status: project.status });
  return { id: project.id, slug: project.slug };
}

export async function restoreProjectRevision(actor: SessionUser, projectId: string, revisionId: string): Promise<void> {
  const rev = await db.projectRevision.findFirst({ where: { id: revisionId, projectId } });
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!rev || !project || project.deletedAt) throw new CmsError("Révision introuvable.");
  const s = rev.snapshot as Record<string, unknown>;
  const blocksRes = BlocksSchema.safeParse(s.blocks ?? []);
  if (!blocksRes.success) throw new CmsError("Cette révision contient un contenu devenu invalide.");
  await loadMediaOrThrow(collectMediaIds(blocksRes.data));
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const updated = await db.project.update({
    where: { id: projectId },
    data: {
      title: typeof s.title === "string" && s.title ? s.title.slice(0, 160) : project.title,
      summary: str(s.summary),
      locationLabel: str(s.locationLabel),
      blocks: blocksRes.data as unknown as object,
      metaTitle: str(s.metaTitle),
      metaDescription: str(s.metaDescription),
      noindex: s.noindex === true,
      isPlaceholder: s.isPlaceholder === true,
      updatedById: actor.id,
    },
  });
  await addRevision("project", projectId, snapshotOf(updated, Array.isArray(s.gallery) ? (s.gallery as string[]) : [], Array.isArray(s.pairs) ? (s.pairs as { beforeId: string; afterId: string }[]) : []), actor.id);
  await audit(actor.id, "project.restore_revision", { type: "Project", id: projectId });
}
