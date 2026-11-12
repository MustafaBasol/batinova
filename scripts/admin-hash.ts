/**
 * Prints an Argon2id hash for BOOTSTRAP_OWNER_PASSWORD_HASH (owner: architect-security).
 *   npm run admin:hash          # hidden prompt (run it on YOUR computer, not on the server)
 * The clear password is never printed or stored. Only the hash goes into the Hostinger environment.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { hashPassword, passwordPolicyError } from "../src/lib/auth/password";

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) return reject(new Error("A TTY is required (the password is never read from arguments or the environment)."));
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
  const password = await promptHidden("Mot de passe OWNER (12 caractères minimum) : ");
  const confirm = await promptHidden("Confirmez le mot de passe : ");
  if (password !== confirm) throw new Error("Passwords do not match");
  const problem = passwordPolicyError(password);
  if (problem) throw new Error(problem);
  console.log(await hashPassword(password));
}

main().catch((err) => {
  console.error("admin:hash failed:", err instanceof Error ? err.message : "error");
  process.exit(1);
});
