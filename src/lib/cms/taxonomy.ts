import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { categoryUrl, tagUrl } from "@/lib/content/paths";
import { audit } from "@/lib/security/audit";
import { SeoFields } from "./publication";
import { recordMove } from "./redirects";
import { CmsError, parseOrThrow } from "./result";
import { assertSlugAvailable, uniqueSlug } from "./slugs";

/** Categories & tags (owner: cms-admin). EDITOR+. */
export const CategoryInputSchema = z
  .object({
    id: z.string().max(64).optional(),
    name: z.string().trim().min(1, "Nom requis").max(80),
    slug: z.string().max(120).default(""),
    description: z.string().trim().max(500).nullish(),
  })
  .extend({ metaTitle: SeoFields.shape.metaTitle, metaDescription: SeoFields.shape.metaDescription, noindex: SeoFields.shape.noindex });

export async function saveCategory(actor: SessionUser, raw: unknown): Promise<{ id: string; slug: string }> {
  const input = parseOrThrow(CategoryInputSchema, raw);
  const existing = input.id ? await db.category.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) throw new CmsError("Catégorie introuvable.");
  if (existing?.deletedAt) throw new CmsError("Cette catégorie est dans la corbeille.");
  const slug = input.slug.trim() ? await assertSlugAvailable("category", input.slug, existing?.id) : await uniqueSlug("category", input.name, existing?.id);
  const data = { name: input.name, slug, description: input.description || null, metaTitle: input.metaTitle, metaDescription: input.metaDescription, noindex: input.noindex };
  const row = existing ? await db.category.update({ where: { id: existing.id }, data }) : await db.category.create({ data });
  if (existing && existing.slug !== slug) await recordMove(categoryUrl(existing.slug), categoryUrl(slug), actor.id);
  await audit(actor.id, existing ? "category.update" : "category.create", { type: "Category", id: row.id }, { slug });
  return { id: row.id, slug };
}

export const TagInputSchema = z.object({
  id: z.string().max(64).optional(),
  name: z.string().trim().min(1, "Nom requis").max(40),
  slug: z.string().max(80).default(""),
});

export async function saveTag(actor: SessionUser, raw: unknown): Promise<{ id: string; slug: string }> {
  const input = parseOrThrow(TagInputSchema, raw);
  const existing = input.id ? await db.tag.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) throw new CmsError("Étiquette introuvable.");
  if (existing?.deletedAt) throw new CmsError("Cette étiquette est dans la corbeille.");
  const slug = input.slug.trim() ? await assertSlugAvailable("tag", input.slug, existing?.id) : await uniqueSlug("tag", input.name, existing?.id);
  const row = existing ? await db.tag.update({ where: { id: existing.id }, data: { name: input.name, slug } }) : await db.tag.create({ data: { name: input.name, slug } });
  if (existing && existing.slug !== slug) await recordMove(tagUrl(existing.slug), tagUrl(slug), actor.id);
  await audit(actor.id, existing ? "tag.update" : "tag.create", { type: "Tag", id: row.id }, { slug });
  return { id: row.id, slug };
}
