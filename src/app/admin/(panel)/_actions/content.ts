"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { TRASH_KINDS } from "@/lib/cms/constants";
import { saveNavLocation } from "@/lib/cms/nav";
import { duplicatePage, restorePageRevision, savePage } from "@/lib/cms/pages";
import { restorePostRevision, savePost } from "@/lib/cms/posts";
import { restoreProjectRevision, saveProject } from "@/lib/cms/projects";
import { deleteRedirect, saveRedirect } from "@/lib/cms/redirect-admin";
import { CmsError, parseOrThrow, runAction, type ActionResult } from "@/lib/cms/result";
import { saveCategory, saveTag } from "@/lib/cms/taxonomy";
import { purge, restoreFromTrash, softDelete } from "@/lib/cms/trash";
import { audit } from "@/lib/security/audit";

/**
 * Content Server Actions (owner: cms-admin). Each action: requireRole -> zod -> lib -> audit.
 * EDITOR+: content, taxonomy, nav, soft delete / restore. OWNER: purge, redirect deletion.
 */
function refreshPublic() {
  revalidatePath("/", "layout");
}

export async function savePageAction(input: unknown): Promise<ActionResult<{ id: string; path: string }>> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => savePage(user, input), "Page enregistrée.");
  if (r.ok) { revalidatePath("/admin/pages"); refreshPublic(); }
  return r;
}

export async function duplicatePageAction(id: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => duplicatePage(user, String(id)), "Page dupliquée (brouillon).");
  if (r.ok) revalidatePath("/admin/pages");
  return r;
}

export async function restorePageRevisionAction(pageId: string, revisionId: string): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => restorePageRevision(user, String(pageId), String(revisionId)), "Version restaurée.");
  if (r.ok) { revalidatePath(`/admin/pages/${pageId}`); refreshPublic(); }
  return r;
}

export async function savePostAction(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => savePost(user, input), "Article enregistré.");
  if (r.ok) { revalidatePath("/admin/articles"); refreshPublic(); }
  return r;
}

export async function restorePostRevisionAction(postId: string, revisionId: string): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => restorePostRevision(user, String(postId), String(revisionId)), "Version restaurée.");
  if (r.ok) { revalidatePath(`/admin/articles/${postId}`); refreshPublic(); }
  return r;
}

export async function saveProjectAction(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => saveProject(user, input), "Réalisation enregistrée.");
  if (r.ok) { revalidatePath("/admin/realisations"); refreshPublic(); }
  return r;
}

export async function restoreProjectRevisionAction(projectId: string, revisionId: string): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => restoreProjectRevision(user, String(projectId), String(revisionId)), "Version restaurée.");
  if (r.ok) { revalidatePath(`/admin/realisations/${projectId}`); refreshPublic(); }
  return r;
}

export async function saveCategoryAction(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => saveCategory(user, input), "Catégorie enregistrée.");
  if (r.ok) { revalidatePath("/admin/taxonomie"); refreshPublic(); }
  return r;
}

export async function saveTagAction(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => saveTag(user, input), "Étiquette enregistrée.");
  if (r.ok) { revalidatePath("/admin/taxonomie"); refreshPublic(); }
  return r;
}

const TrashArgs = z.object({ kind: z.enum(TRASH_KINDS), id: z.string().min(1).max(64) });

export async function softDeleteAction(kind: string, id: string): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(async () => {
    const a = parseOrThrow(TrashArgs, { kind, id });
    await softDelete(user, a.kind, a.id);
  }, "Placé dans la corbeille.");
  if (r.ok) { revalidatePath("/admin", "layout"); refreshPublic(); }
  return r;
}

export async function restoreAction(kind: string, id: string): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(async () => {
    const a = parseOrThrow(TrashArgs, { kind, id });
    await restoreFromTrash(user, a.kind, a.id);
  }, "Élément restauré.");
  if (r.ok) { revalidatePath("/admin", "layout"); refreshPublic(); }
  return r;
}

export async function purgeAction(kind: string, id: string): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const r = await runAction(async () => {
    const a = parseOrThrow(TrashArgs, { kind, id });
    await purge(user, a.kind, a.id);
  }, "Supprimé définitivement.");
  if (r.ok) revalidatePath("/admin/corbeille");
  return r;
}

const UnpublishArgs = z.object({ kind: z.enum(["page", "post", "project"]), id: z.string().min(1).max(64) });

/** Quick "Dépublier": back to DRAFT (content stays editable; public URL stops answering). */
export async function unpublishAction(kind: string, id: string): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(async () => {
    const a = parseOrThrow(UnpublishArgs, { kind, id });
    const data = { status: "DRAFT" as const, scheduledAt: null, updatedById: user.id };
    const where = { id: a.id, deletedAt: null };
    const res = a.kind === "page" ? await db.page.updateMany({ where, data }) : a.kind === "post" ? await db.post.updateMany({ where, data }) : await db.project.updateMany({ where, data });
    if (res.count === 0) throw new CmsError("Élément introuvable.");
    await audit(user.id, `${a.kind}.unpublish`, { type: a.kind, id: a.id });
  }, "Repassé en brouillon.");
  if (r.ok) { revalidatePath("/admin", "layout"); refreshPublic(); }
  return r;
}

export async function saveNavAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(() => saveNavLocation(user, input), "Navigation enregistrée.");
  if (r.ok) { revalidatePath("/admin/navigation"); refreshPublic(); }
  return r;
}

export async function saveRedirectAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireRole("EDITOR"); // 410 is further restricted to OWNER inside saveRedirect
  const r = await runAction(() => saveRedirect(user, input), "Redirection enregistrée.");
  if (r.ok) revalidatePath("/admin/redirections");
  return r;
}

export async function deleteRedirectAction(id: string): Promise<ActionResult> {
  const user = await requireRole("OWNER");
  const r = await runAction(() => deleteRedirect(user, String(id)), "Redirection supprimée.");
  if (r.ok) revalidatePath("/admin/redirections");
  return r;
}
