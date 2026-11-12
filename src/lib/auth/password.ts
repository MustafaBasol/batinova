import "server-only";
import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing (owner: architect-security): Argon2id (library default
 * algorithm) with OWASP-recommended parameters (19 MiB, t=2, p=1).
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  const problem = passwordPolicyError(password);
  if (problem) throw new Error(problem);
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  if (!passwordHash || typeof password !== "string" || password.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/**
 * Spend comparable time when the account does not exist / is locked so that
 * response timing does not reveal valid e-mails.
 */
export async function verifyDummy(password: string): Promise<false> {
  dummyHash ??= hash("batinova-dummy-password-for-timing", OPTIONS);
  await verifyPassword(await dummyHash, password.slice(0, PASSWORD_MAX_LENGTH));
  return false;
}

/** Returns a French error message, or null when acceptable. */
export function passwordPolicyError(password: string): string | null {
  if (typeof password !== "string") return "Mot de passe invalide.";
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (password.length > PASSWORD_MAX_LENGTH) return "Le mot de passe est trop long.";
  if (new Set(password).size < 5) return "Le mot de passe est trop répétitif.";
  return null;
}
