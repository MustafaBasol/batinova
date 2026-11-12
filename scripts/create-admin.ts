/**
 * Create or update an admin user. Owner: architect-security.
 *   npm run admin:create -- --email owner@example.com --name "Prénom Nom" --role OWNER
 * Password: from env ADMIN_INITIAL_PASSWORD (non-interactive) or a hidden prompt.
 * Existing user with the same e-mail: password/role/name are updated, lockout
 * cleared and all sessions revoked (use it as an emergency password reset).
 * Never logs the password.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { hashPassword, passwordPolicyError } from "../src/lib/auth/password";
import { createScriptClient } from "../prisma/seed/client";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) return reject(new Error("No TTY: set ADMIN_INITIAL_PASSWORD instead."));
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const rlAny = rl as unknown as { _writeToOutput: (s: string) => void };
    let muted = false;
    rlAny._writeToOutput = (s: string) => {
      if (!muted) stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      name: { type: "string" },
      role: { type: "string", default: "EDITOR" },
    },
    strict: true,
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  const role = values.role?.toUpperCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("--email is required and must be valid");
  if (!name || name.length < 2 || name.length > 120) throw new Error("--name is required (2-120 chars)");
  if (role !== "OWNER" && role !== "EDITOR") throw new Error("--role must be OWNER or EDITOR");

  let password = process.env.ADMIN_INITIAL_PASSWORD ?? "";
  if (!password) {
    password = await promptHidden("Mot de passe (12 caractères minimum) : ");
    const confirm = await promptHidden("Confirmez le mot de passe : ");
    if (password !== confirm) throw new Error("Passwords do not match");
  }
  const problem = passwordPolicyError(password);
  if (problem) throw new Error(problem);

  const db = createScriptClient();
  try {
    const passwordHash = await hashPassword(password);
    const existing = await db.user.findUnique({ where: { email } });
    const user = existing
      ? await db.user.update({
          where: { email },
          data: { name, role, passwordHash, active: true, failedLoginCount: 0, lockedUntil: null },
        })
      : await db.user.create({ data: { email, name, role, passwordHash } });
    if (existing) await db.session.deleteMany({ where: { userId: user.id } });
    await db.auditLog.create({
      data: {
        actorId: null,
        action: existing ? "user.reset_cli" : "user.create_cli",
        entityType: "User",
        entityId: user.id,
        summary: { role },
      },
    });
    console.log(`${existing ? "Updated" : "Created"} ${role} user ${user.id}.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("admin:create failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
