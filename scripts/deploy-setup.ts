export {};
/**
 * Idempotent deployment setup (owner: architect-security): safe to run on EVERY deployment.
 *   npm run deploy:setup
 *  1. pre-flight: the database must answer (otherwise exit 1 => the Hostinger build fails and the live version stays)
 *  2. serialise with a MySQL named lock (two concurrent deployments cannot migrate at the same time)
 *  3. prisma migrate deploy (only applies pending, committed migrations; never resets, never drops)
 *  4. seed (create-if-missing: never overwrites owner edits)
 *  5. first OWNER from BOOTSTRAP_OWNER_* (no-op once an OWNER exists)
 * Prints step names and counts only: never URLs, passwords or hashes.
 * Migrations run while the previous version is still serving: write them backward-compatible (expand/contract).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  /* rely on the process environment (Hostinger injects it) */
}

const root = path.resolve(import.meta.dirname, "..");
const LOCK = "batinova_deploy_setup";

function step(label: string, args: string[]) {
  const r = spawnSync(process.execPath, args, { cwd: root, env: process.env, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
  console.log(`[deploy:setup] ${label} ok`);
}

async function main() {
  const { createScriptClient } = await import("../prisma/seed/client");
  const db = createScriptClient();
  let locked = false;
  try {
    try {
      await db.$queryRaw`SELECT 1`;
    } catch {
      throw new Error("database unreachable (check DATABASE_URL: host must be 127.0.0.1) — aborting before any change");
    }
    console.log("[deploy:setup] database reachable");
    const got = await db.$queryRaw<{ ok: number | bigint | null }[]>`SELECT GET_LOCK(${LOCK}, 120) AS ok`;
    locked = Number(got[0]?.ok) === 1;
    if (!locked) throw new Error("another deployment setup is running (lock busy)");

    step("migrate deploy", [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"]);
    step("seed (create-if-missing)", [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--conditions=react-server", "prisma/seed/index.ts"]);

    const { bootstrapOwner } = await import("../src/lib/auth/bootstrap");
    const b = await bootstrapOwner(db);
    console.log(`[deploy:setup] owner bootstrap: ${b.result}`);
    if (b.warning) console.log(`[deploy:setup] WARNING: ${b.warning}`);
    if (b.result === "invalid") throw new Error("invalid BOOTSTRAP_OWNER_* configuration");
  } finally {
    if (locked) await db.$queryRaw`SELECT RELEASE_LOCK(${LOCK})`.catch(() => undefined);
    await db.$disconnect();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[deploy:setup] failed:", err instanceof Error ? err.message : "error");
    process.exit(1);
  },
);
