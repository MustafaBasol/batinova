// E2E bootstrap (owner: qa-release). Used as Playwright `webServer.command`.
// Builds an ISOLATED environment under .tmp/e2e (gitignored): fresh SQLite DB (migrate deploy + seed),
// storage dirs, random secrets and random passwords for an OWNER, an EDITOR and a throttling test account.
// Credentials are written to .tmp/e2e/creds.json (gitignored, never committed), then `next start` is spawned
// against the existing production build (run `npm run build` first). Nothing here touches prisma/dev.db.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dir = path.join(root, ".tmp", process.env.E2E_DIR ?? "e2e");
const PORT = process.env.E2E_PORT ?? "3500";
const rand = (n = 24) => randomBytes(n).toString("base64url");

rmSync(dir, { recursive: true, force: true });
mkdirSync(path.join(dir, "media"), { recursive: true });
mkdirSync(path.join(dir, "private"), { recursive: true });

const env = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: `file:./.tmp/${process.env.E2E_DIR ?? "e2e"}/e2e.db`,
  SESSION_SECRET: rand(40),
  IP_HASH_SECRET: rand(40),
  MEDIA_STORAGE_DIR: `./.tmp/${process.env.E2E_DIR ?? "e2e"}/media`,
  PRIVATE_STORAGE_DIR: `./.tmp/${process.env.E2E_DIR ?? "e2e"}/private`,
  SITE_URL: process.env.E2E_SITE_URL ?? "https://btnv.fr", // production value: canonical/OG/sitemap are asserted against it (the server itself still listens on localhost)
  SITE_INDEXING: "true",
  ALLOW_EPHEMERAL_PATHS: "true", // local E2E only: relative .tmp paths / possible http SITE_URL
  TRUST_PROXY: "true", // lets each test pick its own X-Forwarded-For => isolated rate-limit buckets
  SMTP_HOST: "", SMTP_USER: "", SMTP_PASSWORD: "", MAIL_FROM: "",
};
delete env.CANONICAL_HOST;

const creds = {
  owner: { email: "owner.e2e@example.test", password: `Ow-${rand(18)}` },
  editor: { email: "editor.e2e@example.test", password: `Ed-${rand(18)}` },
  lockout: { email: "lockout.e2e@example.test", password: `Lo-${rand(18)}` },
};
writeFileSync(path.join(dir, "creds.json"), JSON.stringify(creds), { mode: 0o600 });

function run(label, cmd, args, extra = {}) {
  const r = spawnSync(cmd, args, { cwd: root, env: { ...env, ...extra }, stdio: "pipe", shell: false, encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`[e2e-setup] ${label} failed\n${r.stdout}\n${r.stderr}`);
    process.exit(1);
  }
  console.log(`[e2e-setup] ${label} ok`);
}
const node = process.execPath;
run("migrate deploy", node, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"]);
const tsx = [path.join(root, "node_modules/tsx/dist/cli.mjs"), "--conditions=react-server"];
run("seed", node, [...tsx, "prisma/seed/index.ts"]);
for (const [key, role] of [["owner", "OWNER"], ["editor", "EDITOR"], ["lockout", "EDITOR"]]) {
  run(`admin:create ${role}`, node, [...tsx, "scripts/create-admin.ts", "--email", creds[key].email, "--name", `Test ${key}`, "--role", role], {
    ADMIN_INITIAL_PASSWORD: creds[key].password,
  });
}

const child = spawn(node, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", PORT], { cwd: root, env, stdio: "inherit" });
const stop = () => child.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => process.exit(code ?? 0));
