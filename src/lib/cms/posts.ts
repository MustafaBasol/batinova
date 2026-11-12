import { z } from "zod";
import { db } from "@/lib/db";
import type { Post } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { postUrl, slugify } from "@/lib/content/paths";
import { collectRichTextMediaIds, estimateReadingMinutes, richTextToPlainText, validateRichText } from "@/lib/richtext/schema";
import { audit } from "@/lib/security/audit";
import { assertMediaAlt, isLive, loadMediaOrThrow, optId, resolvePublication, SeoFields, StatusFields } from "./publication";
import { clearRedirectFrom, recordMove } from "./redirects";
import { CmsError, parseOrThrow } from "./result";
import { addRevision } from "./revisions";
import { assertSlugAvailable, uniqueSlug } from "./slugs";

/** Blog post mutations (owner: cms-admin). Callers authorise (EDITOR+). */

export const PostInputSchema = z
  .object({
    id: z.string().max(64).optional(),
    title: z.string().trim().min(1, "Titre requis").max(160),
    slug: z.string().max(200).default(""),
    excerpt: z.string().trim().max(400).nullish(),
    body: z.unknown(),
    coverImageId: optId,
    categoryId: optId,
    /** Tag names; unknown names are created inline. */
    tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
    authorDisplayName: z.string().trim().max(80).nullish(),
    isPlaceholder: z.boolean().default(false),
  })
  .extend(StatusFields.shape)
  .extend(SeoFields.shape);

function snapshotOf(p: Post, tags: string[]) {
  return {
    title: p.title, slug: p.slug, excerpt: p.excerpt, body: p.body, coverImageId: p.coverImageId, categoryId: p.categoryId,
    tags, authorDisplayName: p.authorDisplayName, status: p.status, isPlaceholder: p.isPlaceholder,
    metaTitle: p.metaTitle, metaDescription: p.metaDescription, ogImageId: p.ogImageId, noindex: p.noindex, canonicalPath: p.canonicalPath,
  };
}

/** Finds or creates tags by name (un-trashes a trashed tag of the same slug). */
async function resolveTags(names: string[]): Promise<string[]> {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const slug = slugify(name);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const found = await db.tag.findUnique({ where: { slug } });
    if (found) {
      if (found.deletedAt) await db.tag.update({ where: { id: found.id }, data: { deletedAt: null, deletedById: null } });
      ids.push(found.id);
    } else {
      ids.push((await db.tag.create({ data: { slug, name } })).id);
    }
  }
  return ids;
}

export async function savePost(actor: SessionUser, raw: unknown, now: Date = new Date()): Promise<{ id: string; slug: string }> {
  const input = parseOrThrow(PostInputSchema, raw);
  const rt = validateRichText(input.body ?? { type: "doc", content: [{ type: "paragraph" }] });
  if (!rt.ok) {
    throw new CmsError("Le contenu de l’article contient des éléments non autorisés.", {
      body: rt.errors.slice(0, 3).map((e) => `${e.path} : ${e.message}`).join(" ; "),
    });
  }
  const existing = input.id ? await db.post.findUnique({ where: { id: input.id }, include: { tags: { include: { tag: true } } } }) : null;
  if (input.id && !existing) throw new CmsError("Article introuvable.");
  if (existing?.deletedAt) throw new CmsError("Cet article est dans la corbeille : restaurez-le avant de le modifier.");

  const slug = input.slug.trim() ? await assertSlugAvailable("post", input.slug, existing?.id) : await uniqueSlug("post", input.title, existing?.id);
  if (input.categoryId) {
    const cat = await db.category.findUnique({ where: { id: input.categoryId } });
    if (!cat || cat.deletedAt) throw new CmsError("Catégorie introuvable.", { categoryId: "Catégorie introuvable." });
  }
  const bodyMedia = collectRichTextMediaIds(rt.doc);
  await loadMediaOrThrow([input.coverImageId, input.ogImageId, ...bodyMedia]);

  const pub = resolvePublication(existing, input, now);
  if (isLive(pub.status)) {
    if (!input.coverImageId) throw new CmsError("Une image de couverture est requise pour publier.", { coverImageId: "Image de couverture requise." });
    if (!richTextToPlainText(rt.doc).trim()) throw new CmsError("L’article est vide.", { body: "Rédigez le contenu avant de publier." });
    await assertMediaAlt([input.coverImageId, input.ogImageId, ...bodyMedia]);
  }

  const tagIds = await resolveTags(input.tags);
  const data = {
    slug,
    title: input.title,
    excerpt: input.excerpt || null,
    body: rt.doc as unknown as object,
    coverImageId: input.coverImageId,
    categoryId: input.categoryId,
    authorDisplayName: input.authorDisplayName || null,
    readingMinutes: estimateReadingMinutes(rt.doc),
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

  let post: Post;
  if (existing) {
    post = await db.post.update({ where: { id: existing.id }, data });
    await db.postTag.deleteMany({ where: { postId: post.id } });
    if (existing.slug !== slug) {
      if (existing.status !== "DRAFT" || existing.publishedAt) await recordMove(postUrl(existing.slug), postUrl(slug), actor.id);
      else await clearRedirectFrom(postUrl(slug));
    }
  } else {
    post = await db.post.create({ data });
    await clearRedirectFrom(postUrl(slug));
  }
  if (tagIds.length) await db.postTag.createMany({ data: tagIds.map((tagId) => ({ postId: post.id, tagId })) });
  const tagNames = (await db.tag.findMany({ where: { id: { in: tagIds } }, select: { name: true } })).map((t) => t.name);
  await addRevision("post", post.id, snapshotOf(post, tagNames), actor.id);
  const verb = existing
    ? existing.status !== post.status && isLive(post.status) ? "publish" : existing.status !== post.status && isLive(existing.status) ? "unpublish" : "update"
    : "create";
  await audit(actor.id, `post.${verb}`, { type: "Post", id: post.id }, { slug: post.slug, status: post.status });
  return { id: post.id, slug: post.slug };
}

export async function restorePostRevision(actor: SessionUser, postId: string, revisionId: string): Promise<void> {
  const rev = await db.postRevision.findFirst({ where: { id: revisionId, postId } });
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!rev || !post || post.deletedAt) throw new CmsError("Révision introuvable.");
  const s = rev.snapshot as Record<string, unknown>;
  const rt = validateRichText(s.body);
  if (!rt.ok) throw new CmsError("Cette révision contient un contenu devenu invalide.");
  await loadMediaOrThrow(collectRichTextMediaIds(rt.doc));
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const updated = await db.post.update({
    where: { id: postId },
    data: {
      title: typeof s.title === "string" && s.title ? s.title.slice(0, 160) : post.title,
      excerpt: str(s.excerpt),
      body: rt.doc as unknown as object,
      readingMinutes: estimateReadingMinutes(rt.doc),
      authorDisplayName: str(s.authorDisplayName),
      metaTitle: str(s.metaTitle),
      metaDescription: str(s.metaDescription),
      noindex: s.noindex === true,
      updatedById: actor.id,
    },
  });
  await addRevision("post", postId, snapshotOf(updated, Array.isArray(s.tags) ? (s.tags as string[]) : []), actor.id);
  await audit(actor.id, "post.restore_revision", { type: "Post", id: postId });
}
