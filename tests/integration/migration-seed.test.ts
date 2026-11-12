// Fresh-install pipeline on an EMPTY MySQL/MariaDB database (owner: qa-release): migrate deploy -> seed -> seed again.
// Proves the baseline migration matches schema.prisma (no drift), the seed is idempotent and never overwrites edits,
// and that deploy-setup + owner bootstrap are safe to re-run. Uses its own throwaway database (name contains "test").
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as mariadb from "mariadb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDatabaseUrl } from "@/lib/db-url";
import { dropDatabase, recreateDatabase, testDatabaseUrl } from "../support/mysql";
import { hashPassword } from "@/lib/auth/password";

const root = path.resolve(import.meta.dirname, "../..");
const base = new URL(testDatabaseUrl());
base.pathname = "/batinova_seedpipeline_test";
const url = base.toString();
const storage = mkdtempSync(path.join(tmpdir(), "btnv-seed-"));
const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...process.env,
  NODE_ENV: "test" as const,
  DATABASE_URL: url,
  MEDIA_STORAGE_DIR: path.join(storage, "media"),
  PRIVATE_STORAGE_DIR: path.join(storage, "private"),
  SESSION_SECRET: "test-session-secret-0123456789-abcdefghijklmnop",
  IP_HASH_SECRET: "test-iphash-secret-0123456789-abcdefghijklmnopq",
  SITE_URL: "https://btnv.fr",
  ...extra,
});
const node = (args: string[], extra: Record<string, string> = {}) =>
  execFileSync(process.execPath, args, { cwd: root, env: env(extra), encoding: "utf8", stdio: "pipe" });
const prisma = (...a: string[]) => node([path.join(root, "node_modules/prisma/build/index.js"), ...a]);
const tsx = (...a: string[]) => node([path.join(root, "node_modules/tsx/dist/cli.mjs"), "--conditions=react-server", ...a]);

async function counts(): Promise<Record<string, number>> {
  const c = parseDatabaseUrl(url);
  const conn = await mariadb.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database });
  try {
    const tables = (await conn.query("SHOW TABLES")) as Record<string, string>[];
    const out: Record<string, number> = {};
    for (const t of tables) {
      const name = Object.values(t)[0]!;
      if (name === "_prisma_migrations") continue;
      out[name] = Number((await conn.query(`SELECT COUNT(*) AS n FROM \`${name}\``))[0].n);
    }
    return out;
  } finally {
    await conn.end();
  }
}
async function sql<T = Record<string, unknown>>(q: string): Promise<T[]> {
  const c = parseDatabaseUrl(url);
  const conn = await mariadb.createConnection({ host: c.host, port: c.port, user: c.user, password: c.password, database: c.database });
  try {
    return Array.from((await conn.query(q)) as T[]);
  } finally {
    await conn.end();
  }
}

beforeAll(async () => {
  await recreateDatabase(url);
}, 60_000);
afterAll(async () => {
  await dropDatabase(url);
  rmSync(storage, { recursive: true, force: true });
});

describe("fresh MySQL install", () => {
  it("migrate deploy applies the baseline and the schema has no drift", () => {
    const out = prisma("migrate", "deploy");
    expect(out).toMatch(/successfully applied|All migrations have been successfully applied/i);
    expect(prisma("migrate", "status")).toMatch(/up to date/i);
    // exit code 0 only when the migrated database equals schema.prisma
    expect(() => prisma("migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code")).not.toThrow();
  }, 120_000);

  it("seed is create-if-missing and idempotent; owner edits survive a second run", async () => {
    tsx("prisma/seed/index.ts");
    const first = await counts();
    expect(first.Page).toBeGreaterThan(5);
    expect(first.Setting).toBeGreaterThan(0);
    expect(first.User).toBe(0); // the seed never creates accounts
    await sql("UPDATE `Page` SET title = 'Titre modifié par le propriétaire' WHERE path = ''");
    tsx("prisma/seed/index.ts");
    expect(await counts()).toEqual(first);
    expect((await sql<{ title: string }>("SELECT title FROM `Page` WHERE path = ''"))[0]!.title).toBe("Titre modifié par le propriétaire");
  }, 240_000);

  it("deploy:setup is re-runnable, creates the OWNER once from the hash and never duplicates", async () => {
    const hash = await hashPassword("a long enough bootstrap password");
    const bootstrap = { BOOTSTRAP_OWNER_EMAIL: "owner@example.test", BOOTSTRAP_OWNER_PASSWORD_HASH: hash };
    const out1 = tsxWith("scripts/deploy-setup.ts", bootstrap);
    expect(out1).toMatch(/owner bootstrap: created/);
    const out2 = tsxWith("scripts/deploy-setup.ts", bootstrap);
    expect(out2).toMatch(/owner bootstrap: owner_exists/);
    expect(out2).toMatch(/WARNING/);
    expect(out2).not.toContain(hash);
    expect((await counts()).User).toBe(1);
    expect((await sql<{ role: string }>("SELECT role FROM `User`"))[0]!.role).toBe("OWNER");
  }, 300_000);

  it("deploy:setup aborts BEFORE touching anything when the database is unreachable", () => {
    let err: { status?: number; stderr?: string; stdout?: string } = {};
    try {
      node([path.join(root, "node_modules/tsx/dist/cli.mjs"), "--conditions=react-server", "scripts/deploy-setup.ts"], { DATABASE_URL: "mysql://nobody:wrong@127.0.0.1:1/missing_test" });
    } catch (e) {
      err = e as typeof err;
    }
    expect(err.status).toBe(1);
    expect(String(err.stderr)).toMatch(/database unreachable/);
    expect(String(err.stderr) + String(err.stdout)).not.toMatch(/nobody|wrong/);
  }, 120_000);
});

function tsxWith(script: string, extra: Record<string, string>): string {
  return node([path.join(root, "node_modules/tsx/dist/cli.mjs"), "--conditions=react-server", script], extra);
}
