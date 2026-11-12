import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { REDIRECT_CODES } from "./constants";
import { assertNoLoop, validateFromPath, validateToPath } from "./redirects";
import { CmsError, parseOrThrow } from "./result";

/** Manual redirects CRUD (owner: cms-admin). EDITOR: 301/302/308 create+edit. OWNER: 410 and deletion. */
const Schema = z.object({
  id: z.string().max(64).optional(),
  fromPath: z.string().trim().max(512),
  toPath: z.string().trim().max(2048).nullish(),
  statusCode: z.number().int().refine((n) => (REDIRECT_CODES as readonly number[]).includes(n), "Code invalide"),
  note: z.string().trim().max(200).nullish(),
});

export async function saveRedirect(actor: SessionUser, raw: unknown): Promise<{ id: string }> {
  const input = parseOrThrow(Schema, raw);
  const existing = input.id ? await db.redirect.findUnique({ where: { id: input.id } }) : null;
  if (input.id && !existing) throw new CmsError("Redirection introuvable.");
  if ((input.statusCode === 410 || existing?.statusCode === 410) && actor.role !== "OWNER") {
    throw new CmsError("Les réponses « 410 supprimé » sont réservées au propriétaire.");
  }
  const fromErr = validateFromPath(input.fromPath);
  if (fromErr) throw new CmsError(fromErr, { fromPath: fromErr });
  let toPath: string | null = null;
  if (input.statusCode !== 410) {
    if (!input.toPath) throw new CmsError("Destination requise.", { toPath: "Destination requise." });
    const toErr = validateToPath(input.toPath);
    if (toErr) throw new CmsError(toErr, { toPath: toErr });
    toPath = input.toPath;
    await assertNoLoop(input.fromPath, toPath, existing?.id);
  }
  const dup = await db.redirect.findUnique({ where: { fromPath: input.fromPath } });
  if (dup && dup.id !== existing?.id) throw new CmsError("Une redirection existe déjà pour ce chemin.", { fromPath: "Déjà redirigé." });
  const live = await db.page.findFirst({ where: { path: input.fromPath.replace(/^\//, ""), deletedAt: null }, select: { id: true } });
  if (live) throw new CmsError("Une page existe à cette adresse : la redirection la masquerait.", { fromPath: "Cette adresse correspond à une page existante." });

  const data = { fromPath: input.fromPath, toPath, statusCode: input.statusCode, note: input.note || null };
  const row = existing
    ? await db.redirect.update({ where: { id: existing.id }, data })
    : await db.redirect.create({ data: { ...data, createdById: actor.id } });
  await audit(actor.id, existing ? "redirect.update" : "redirect.create", { type: "Redirect", id: row.id }, { fromPath: row.fromPath, toPath: row.toPath, statusCode: row.statusCode });
  return { id: row.id };
}

export async function deleteRedirect(actor: SessionUser, id: string): Promise<void> {
  if (actor.role !== "OWNER") throw new CmsError("Réservé au propriétaire.");
  const row = await db.redirect.findUnique({ where: { id } });
  if (!row) throw new CmsError("Redirection introuvable.");
  await db.redirect.delete({ where: { id } });
  await audit(actor.id, "redirect.delete", { type: "Redirect", id }, { fromPath: row.fromPath });
}
