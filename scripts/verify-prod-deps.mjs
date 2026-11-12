// Regression guard (owner: architect-security): the Hostinger build host installs PRODUCTION dependencies only.
//   npm ci --omit=dev && node scripts/verify-prod-deps.mjs
// Fails if a tool used by build:hostinger / operations scripts / next build is not installed in that mode.
// Read-only: never touches a database, never prints environment values.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const required = ["prisma", "tsx", "next", "typescript", "tailwindcss", "@tailwindcss/postcss", "mariadb", "@prisma/client", "@prisma/adapter-mariadb", "@types/node", "@types/react", "@types/react-dom"];
let failed = false;
const fail = (m) => { failed = true; console.error(`[verify-prod-deps] FAIL ${m}`); };

for (const name of required) {
  if (!pkg.dependencies?.[name]) fail(`${name} must be in "dependencies" (not devDependencies)`);
  if (!existsSync(`node_modules/${name}/package.json`)) fail(`${name} is not installed after --omit=dev`);
}
// every npm script that shells out to tsx/prisma must resolve to a production dependency
for (const [script, cmd] of Object.entries(pkg.scripts ?? {})) {
  for (const bin of ["tsx", "prisma", "next"]) {
    if (new RegExp(`(^|[\\s&;|])${bin}(\\s|$)`).test(cmd) && !pkg.dependencies?.[bin]) fail(`script "${script}" uses ${bin} but it is not a production dependency`);
  }
}
for (const bin of ["tsx/dist/cli.mjs", "prisma/build/index.js"]) {
  if (!existsSync(`node_modules/${bin}`)) fail(`node_modules/${bin} missing (deploy-setup spawns it directly)`);
}
// deploy:setup must reach its own env validation (fails safely, before any DB access, when DATABASE_URL is unset)
const env = { ...process.env };
delete env.DATABASE_URL;
const r = spawnSync("npm", ["run", "-s", "deploy:setup"], { env, encoding: "utf8" });
const out = `${r.stdout}${r.stderr}`;
if (/tsx: (command )?not found|not found/i.test(out) || !/DATABASE_URL is not set/.test(out) || r.status === 0) {
  fail(`deploy:setup did not start and stop cleanly at env validation (exit ${r.status})`);
}
const p = spawnSync("npx", ["--no-install", "prisma", "--version"], { encoding: "utf8" });
if (p.status !== 0) fail("prisma CLI not runnable");
if (failed) process.exit(1);
console.log("[verify-prod-deps] ok: tools present, deploy:setup starts without database");
