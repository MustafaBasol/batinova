import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { HOME_PATH } from "@/lib/content/paths";
import { hardDeleteMedia, restoreMedia, softDeleteMedia } from "@/lib/media/service";
import { audit } from "@/lib/security/audit";
import type { TrashKind } from "./constants";
import { CmsError } from "./result";

/** Soft delete ("corbeille"), restore and OWNER-only purge (owner: cms-admin). */

type Delegate = {
  findUnique(a: { where: { id: string } }): Promise<{ id: string; deletedAt: Date | null } | null>;
  update(a: { where: { id: string }; data: { deletedAt: Date | null; deletedById: string | null } }): Promise<unknown>;
  delete(a: { where: { id: string } }): Promise<unknown>;
};

function delegate(kind: Exclude<TrashKind, "media">): Delegate {
  switch (kind) {
    case "page": return db.page as unknown as Delegate;
    case "post": return db.post as unknown as Delegate;
    case "project": return db.project as unknown as Delegate;
    case "category": return db.category as unknown as Delegate;
    case "tag": return db.tag as unknown as Delegate;
  }
}

const ENTITY: Record<TrashKind, string> = { page: "Page", post: "Post", project: "Project", media: "Media", category: "Category", tag: "Tag" };

export async function softDelete(actor: SessionUser, kind: TrashKind, id: string): Promise<void> {
  if (kind === "media") return softDeleteMedia(id, actor.id);
  const d = delegate(kind);
  const row = await d.findUnique({ where: { id } });
  if (!row) throw new CmsError("Élément introuvable.");
  if (kind === "page") {
    const page = await db.page.findUnique({ where: { id }, select: { path: true } });
    if (page?.path === HOME_PATH) throw new CmsError("La page d’accueil ne peut pas être supprimée.");
  }
  if (row.deletedAt) return;
  await d.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id } });
  await audit(actor.id, `${kind}.delete`, { type: ENTITY[kind], id });
}

export async function restoreFromTrash(actor: SessionUser, kind: TrashKind, id: string): Promise<void> {
  if (kind === "media") return restoreMedia(id, actor.id);
  const d = delegate(kind);
  const row = await d.findUnique({ where: { id } });
  if (!row) throw new CmsError("Élément introuvable.");
  await d.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
  await audit(actor.id, `${kind}.restore`, { type: ENTITY[kind], id });
}

/** OWNER only; the item must already be in the trash. */
export async function purge(actor: SessionUser, kind: TrashKind, id: string): Promise<void> {
  if (actor.role !== "OWNER") throw new CmsError("Réservé au propriétaire.");
  if (kind === "media") return hardDeleteMedia(id, actor.id);
  const d = delegate(kind);
  const row = await d.findUnique({ where: { id } });
  if (!row) throw new CmsError("Élément introuvable.");
  if (!row.deletedAt) throw new CmsError("Placez d’abord l’élément dans la corbeille.");
  await d.delete({ where: { id } });
  await audit(actor.id, `${kind}.purge`, { type: ENTITY[kind], id });
}

export async function listTrash() {
  const [pages, posts, projects, media, categories, tags] = await Promise.all([
    db.page.findMany({ where: { deletedAt: { not: null } }, select: { id: true, title: true, path: true, deletedAt: true }, orderBy: { deletedAt: "desc" } }),
    db.post.findMany({ where: { deletedAt: { not: null } }, select: { id: true, title: true, slug: true, deletedAt: true }, orderBy: { deletedAt: "desc" } }),
    db.project.findMany({ where: { deletedAt: { not: null } }, select: { id: true, title: true, slug: true, deletedAt: true }, orderBy: { deletedAt: "desc" } }),
    db.media.findMany({ where: { deletedAt: { not: null } }, select: { id: true, originalName: true, alt: true, deletedAt: true }, orderBy: { deletedAt: "desc" } }),
    db.category.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, slug: true, deletedAt: true }, orderBy: { deletedAt: "desc" } }),
    db.tag.findMany({ where: { deletedAt: { not: null } }, select: { id: true, name: true, slug: true, deletedAt: true }, orderBy: { deletedAt: "desc" } }),
  ]);
  type Item = { kind: TrashKind; id: string; label: string; detail: string; deletedAt: Date };
  const items: Item[] = [
    ...pages.map((p) => ({ kind: "page" as const, id: p.id, label: p.title, detail: `/${p.path}`, deletedAt: p.deletedAt! })),
    ...posts.map((p) => ({ kind: "post" as const, id: p.id, label: p.title, detail: `/blog/${p.slug}`, deletedAt: p.deletedAt! })),
    ...projects.map((p) => ({ kind: "project" as const, id: p.id, label: p.title, detail: `/realisations/${p.slug}`, deletedAt: p.deletedAt! })),
    ...media.map((m) => ({ kind: "media" as const, id: m.id, label: m.originalName, detail: m.alt || "sans texte alternatif", deletedAt: m.deletedAt! })),
    ...categories.map((c) => ({ kind: "category" as const, id: c.id, label: c.name, detail: c.slug, deletedAt: c.deletedAt! })),
    ...tags.map((t) => ({ kind: "tag" as const, id: t.id, label: t.name, detail: t.slug, deletedAt: t.deletedAt! })),
  ];
  return items.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
}
