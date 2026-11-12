import { db } from "@/lib/db";

/** Revision snapshots (owner: cms-admin). Keeps the latest KEEP per entity. */
export const KEEP_REVISIONS = 50;
export type RevisionKind = "page" | "post" | "project";

export async function addRevision(kind: RevisionKind, entityId: string, snapshot: Record<string, unknown>, authorId: string | null): Promise<void> {
  const data = snapshot as object;
  if (kind === "page") {
    await db.pageRevision.create({ data: { pageId: entityId, snapshot: data, authorId } });
    const old = await db.pageRevision.findMany({ where: { pageId: entityId }, orderBy: { createdAt: "desc" }, skip: KEEP_REVISIONS, select: { id: true } });
    if (old.length) await db.pageRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  } else if (kind === "post") {
    await db.postRevision.create({ data: { postId: entityId, snapshot: data, authorId } });
    const old = await db.postRevision.findMany({ where: { postId: entityId }, orderBy: { createdAt: "desc" }, skip: KEEP_REVISIONS, select: { id: true } });
    if (old.length) await db.postRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  } else {
    await db.projectRevision.create({ data: { projectId: entityId, snapshot: data, authorId } });
    const old = await db.projectRevision.findMany({ where: { projectId: entityId }, orderBy: { createdAt: "desc" }, skip: KEEP_REVISIONS, select: { id: true } });
    if (old.length) await db.projectRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  }
}

export async function listRevisions(kind: RevisionKind, entityId: string) {
  const select = { id: true, createdAt: true, author: { select: { name: true } } } as const;
  if (kind === "page") return db.pageRevision.findMany({ where: { pageId: entityId }, orderBy: { createdAt: "desc" }, take: KEEP_REVISIONS, select });
  if (kind === "post") return db.postRevision.findMany({ where: { postId: entityId }, orderBy: { createdAt: "desc" }, take: KEEP_REVISIONS, select });
  return db.projectRevision.findMany({ where: { projectId: entityId }, orderBy: { createdAt: "desc" }, take: KEEP_REVISIONS, select });
}
