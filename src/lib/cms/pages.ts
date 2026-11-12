import { z } from "zod";
import { db } from "@/lib/db";
import type { Page } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { BlocksSchema, collectMediaIds, type CmsBlock } from "@/lib/blocks/schema";
import { HOME_PATH, pageUrl } from "@/lib/content/paths";
import { audit } from "@/lib/security/audit";
import { PAGE_TEMPLATES } from "./constants";
import { assertMediaAlt, isLive, loadMediaOrThrow, optId, resolvePublication, SeoFields, StatusFields } from "./publication";
import { clearRedirectFrom, recordMove } from "./redirects";
import { CmsError, parseOrThrow } from "./result";
import { assertPagePathAvailable, normalizePagePath, uniquePagePath } from "./slugs";
import { slugify } from "@/lib/content/paths";
import { addRevision } from "./revisions";

/** Page mutations (owner: cms-admin). Callers authorise (EDITOR+) before calling. */

export const PageInputSchema = z
  .object({
    id: z.string().max(64).optional(),
    title: z.string().trim().min(1, "Titre requis").max(160),
    path: z.string().max(400).default(""),
    template: z.enum(PAGE_TEMPLATES),
    blocks: z.unknown(),
    showInNav: z.boolean().default(false),
    navOrder: z.number().int().min(0).max(10_000).default(0),
    navLabel: z.string().trim().max(60).nullish(),
    parentId: optId,
    isPlaceholder: z.boolean().default(false),
  })
  .extend(StatusFields.shape)
  .extend(SeoFields.shape);
export type PageInput = z.input<typeof PageInputSchema>;

function blockIssues(blocks: unknown): CmsBlock[] {
  const res = BlocksSchema.safeParse(blocks ?? []);
  if (res.success) return res.data;
  const fe: Record<string, string> = {};
  for (const i of res.error.issues) {
    const idx = typeof i.path[0] === "number" ? i.path[0] : -1;
    fe[`block:${idx}`] ??= `${i.path.slice(1).join(".") || "bloc"} : ${i.message}`;
  }
  throw new CmsError("Certains blocs sont incomplets ou invalides.", fe);
}

function snapshotOf(p: Page) {
  return {
    path: p.path, title: p.title, template: p.template, blocks: p.blocks, showInNav: p.showInNav, navOrder: p.navOrder,
    navLabel: p.navLabel, parentId: p.parentId, isPlaceholder: p.isPlaceholder, status: p.status,
    metaTitle: p.metaTitle, metaDescription: p.metaDescription, ogImageId: p.ogImageId, noindex: p.noindex, canonicalPath: p.canonicalPath,
  };
}

async function assertParent(parentId: string | null, selfId?: string) {
  if (!parentId) return;
  let cur: string | null = parentId;
  for (let i = 0; i < 10 && cur; i++) {
    if (cur === selfId) throw new CmsError("Une page ne peut pas être sa propre parente.", { parentId: "Parent invalide." });
    const p: { parentId: string | null } | null = await db.page.findUnique({ where: { id: cur }, select: { parentId: true } });
    if (!p) throw new CmsError("Page parente introuvable.", { parentId: "Parent introuvable." });
    cur = p.parentId;
  }
}

export async function savePage(actor: SessionUser, raw: unknown, now: Date = new Date()): Promise<{ id: string; path: string }> {
  const input = parseOrThrow(PageInputSchema, raw);
  const blocks = blockIssues(input.blocks);
  const existing = input.id ? await db.page.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) throw new CmsError("Page introuvable.");
  if (existing?.deletedAt) throw new CmsError("Cette page est dans la corbeille : restaurez-la avant de la modifier.");

  // path rules: "" is the home page and only the home page
  let path = normalizePagePath(input.path);
  if (input.template === "HOME") path = HOME_PATH;
  else if (path === HOME_PATH) {
    if (!input.path.trim()) path = await uniquePagePath(slugify(input.title) || "page", existing?.id);
    else throw new CmsError("Adresse invalide.", { path: "Adresse requise." });
  }
  await assertPagePathAvailable(path, existing?.id);
  await assertParent(input.parentId, existing?.id);
  if (input.ogImageId) await loadMediaOrThrow([input.ogImageId]);
  const mediaIds = collectMediaIds(blocks);
  await loadMediaOrThrow(mediaIds);

  const pub = resolvePublication(existing, input, now);
  if (isLive(pub.status)) await assertMediaAlt([...mediaIds, input.ogImageId]);

  const data = {
    path,
    title: input.title,
    template: input.template,
    blocks: blocks as unknown as object,
    showInNav: input.showInNav,
    navOrder: input.navOrder,
    navLabel: input.navLabel ? input.navLabel : null,
    parentId: input.parentId,
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

  let page: Page;
  if (existing) {
    page = await db.page.update({ where: { id: existing.id }, data });
    const wasPublic = existing.status !== "DRAFT" || !!existing.publishedAt;
    if (existing.path !== path) {
      if (wasPublic) await recordMove(pageUrl(existing.path), pageUrl(path), actor.id);
      else await clearRedirectFrom(pageUrl(path));
    }
  } else {
    page = await db.page.create({ data });
    await clearRedirectFrom(pageUrl(path));
  }
  await addRevision("page", page.id, snapshotOf(page), actor.id);
  const verb = existing ? (existing.status !== page.status && isLive(page.status) ? "publish" : existing.status !== page.status && isLive(existing.status) ? "unpublish" : "update") : "create";
  await audit(actor.id, `page.${verb}`, { type: "Page", id: page.id }, { path: page.path, status: page.status });
  return { id: page.id, path: page.path };
}

export async function duplicatePage(actor: SessionUser, id: string): Promise<{ id: string }> {
  const src = await db.page.findUnique({ where: { id } });
  if (!src || src.deletedAt) throw new CmsError("Page introuvable.");
  const path = await uniquePagePath(src.path === HOME_PATH ? "accueil-copie" : `${src.path}-copie`);
  const copy = await db.page.create({
    data: {
      path,
      title: `${src.title} (copie)`,
      template: src.template === "HOME" ? "STANDARD" : src.template,
      blocks: (src.blocks ?? []) as object,
      status: "DRAFT",
      showInNav: false,
      navOrder: src.navOrder,
      navLabel: src.navLabel,
      parentId: src.parentId,
      isPlaceholder: src.isPlaceholder,
      metaTitle: src.metaTitle,
      metaDescription: src.metaDescription,
      ogImageId: src.ogImageId,
      noindex: true, // a copy never goes to Google until reviewed
      canonicalPath: null,
      updatedById: actor.id,
    },
  });
  await addRevision("page", copy.id, snapshotOf(copy), actor.id);
  await audit(actor.id, "page.duplicate", { type: "Page", id: copy.id }, { path });
  return { id: copy.id };
}

/** Restores content fields of a revision (never status, dates or the address). Creates a new revision. */
export async function restorePageRevision(actor: SessionUser, pageId: string, revisionId: string): Promise<void> {
  const rev = await db.pageRevision.findFirst({ where: { id: revisionId, pageId } });
  const page = await db.page.findUnique({ where: { id: pageId } });
  if (!rev || !page || page.deletedAt) throw new CmsError("Révision introuvable.");
  const s = rev.snapshot as Record<string, unknown>;
  const blocks = blockIssues(s.blocks);
  await loadMediaOrThrow(collectMediaIds(blocks));
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const updated = await db.page.update({
    where: { id: pageId },
    data: {
      title: typeof s.title === "string" && s.title ? s.title.slice(0, 160) : page.title,
      blocks: blocks as unknown as object,
      metaTitle: str(s.metaTitle),
      metaDescription: str(s.metaDescription),
      noindex: s.noindex === true,
      navLabel: str(s.navLabel),
      isPlaceholder: s.isPlaceholder === true,
      updatedById: actor.id,
    },
  });
  await addRevision("page", pageId, snapshotOf(updated), actor.id);
  await audit(actor.id, "page.restore_revision", { type: "Page", id: pageId });
}
