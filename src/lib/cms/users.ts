import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, passwordPolicyError } from "@/lib/auth/password";
import { revokeAllUserSessions, type SessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { CmsError, parseOrThrow } from "./result";

/** User management (owner: cms-admin). EVERY function requires an OWNER actor (checked here as well as in the action). */
function assertOwner(actor: SessionUser) {
  if (actor.role !== "OWNER") throw new CmsError("Réservé au propriétaire.");
}

const email = z.string().trim().toLowerCase().max(254).regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, "Adresse e-mail invalide");
const role = z.enum(["OWNER", "EDITOR"]);

async function activeOwnerCount(excludeId?: string) {
  return db.user.count({ where: { role: "OWNER", active: true, ...(excludeId ? { NOT: { id: excludeId } } : {}) } });
}

const CreateSchema = z.object({ email, name: z.string().trim().min(2, "Nom requis").max(120), role, password: z.string().max(256) });

export async function createUser(actor: SessionUser, raw: unknown): Promise<{ id: string }> {
  assertOwner(actor);
  const input = parseOrThrow(CreateSchema, raw);
  const problem = passwordPolicyError(input.password);
  if (problem) throw new CmsError(problem, { password: problem });
  if (await db.user.findUnique({ where: { email: input.email } })) throw new CmsError("Un compte existe déjà avec cette adresse.", { email: "Adresse déjà utilisée." });
  const user = await db.user.create({ data: { email: input.email, name: input.name, role: input.role, passwordHash: await hashPassword(input.password) } });
  await audit(actor.id, "user.create", { type: "User", id: user.id }, { role: user.role });
  return { id: user.id };
}

const UpdateSchema = z.object({ id: z.string().max(64), name: z.string().trim().min(2).max(120), role, active: z.boolean() });

export async function updateUser(actor: SessionUser, raw: unknown): Promise<void> {
  assertOwner(actor);
  const input = parseOrThrow(UpdateSchema, raw);
  const target = await db.user.findUnique({ where: { id: input.id } });
  if (!target) throw new CmsError("Utilisateur introuvable.");
  if (target.id === actor.id && !input.active) throw new CmsError("Vous ne pouvez pas désactiver votre propre compte.");
  const losesOwner = target.role === "OWNER" && target.active && (input.role !== "OWNER" || !input.active);
  if (losesOwner && (await activeOwnerCount(target.id)) === 0) {
    throw new CmsError("Impossible : il doit rester au moins un propriétaire actif.");
  }
  await db.user.update({ where: { id: target.id }, data: { name: input.name, role: input.role, active: input.active } });
  if (input.role !== target.role || !input.active) await revokeAllUserSessions(target.id);
  await audit(actor.id, "user.update", { type: "User", id: target.id }, { role: input.role, active: input.active });
}

const ResetSchema = z.object({ id: z.string().max(64), password: z.string().max(256) });

export async function resetUserPassword(actor: SessionUser, raw: unknown): Promise<void> {
  assertOwner(actor);
  const input = parseOrThrow(ResetSchema, raw);
  const problem = passwordPolicyError(input.password);
  if (problem) throw new CmsError(problem, { password: problem });
  const target = await db.user.findUnique({ where: { id: input.id }, select: { id: true } });
  if (!target) throw new CmsError("Utilisateur introuvable.");
  await db.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(input.password), failedLoginCount: 0, lockedUntil: null } });
  await revokeAllUserSessions(target.id);
  await audit(actor.id, "user.reset_password", { type: "User", id: target.id });
}
