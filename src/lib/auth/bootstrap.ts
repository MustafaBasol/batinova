import type { PrismaClient } from "@/generated/prisma/client";

/**
 * First-OWNER bootstrap (owner: architect-security). NOT an endpoint: it runs at server start and in
 * `npm run deploy:setup`, and is inert as soon as ANY OWNER exists, so it cannot be used to add accounts later.
 *
 * Inputs (environment, set once in the Hostinger panel, then removed):
 *   BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD_HASH (Argon2id hash from `npm run admin:hash`, NEVER the clear password),
 *   BOOTSTRAP_OWNER_NAME (optional).
 * The clear password is never stored in the environment, in logs or in the repository.
 */
export type BootstrapResult = "disabled" | "owner_exists" | "created" | "invalid";

const ARGON2ID = /^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/]+\$[A-Za-z0-9+/]+$/;

export async function bootstrapOwner(
  db: PrismaClient,
  env: Record<string, string | undefined> = process.env,
): Promise<{ result: BootstrapResult; warning?: string }> {
  const email = env.BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  const hash = env.BOOTSTRAP_OWNER_PASSWORD_HASH?.trim();
  if (!email && !hash) return { result: "disabled" };

  const owners = await db.user.count({ where: { role: "OWNER" } });
  if (owners > 0) {
    return { result: "owner_exists", warning: "BOOTSTRAP_OWNER_* variables are still set although an OWNER exists: remove them from the environment." };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return { result: "invalid", warning: "BOOTSTRAP_OWNER_EMAIL is missing or invalid." };
  if (!hash || !ARGON2ID.test(hash)) return { result: "invalid", warning: "BOOTSTRAP_OWNER_PASSWORD_HASH must be an Argon2id hash (npm run admin:hash)." };
  const name = (env.BOOTSTRAP_OWNER_NAME?.trim() || "Propriétaire").slice(0, 120);

  // An EDITOR already using this e-mail must not be silently promoted: refuse instead.
  const clash = await db.user.findUnique({ where: { email } });
  if (clash) return { result: "invalid", warning: "BOOTSTRAP_OWNER_EMAIL already belongs to a non-OWNER account." };

  const user = await db.user.create({ data: { email, name, role: "OWNER", passwordHash: hash } });
  await db.auditLog.create({ data: { actorId: null, action: "user.bootstrap_env", entityType: "User", entityId: user.id, summary: { role: "OWNER" } } });
  return { result: "created", warning: "OWNER created from BOOTSTRAP_OWNER_*: remove these variables from the environment now." };
}
