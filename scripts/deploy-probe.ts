export {};
/**
 * Read-only environment probe for the FIRST Hostinger build (owner: architect-security).
 *   npm run deploy:probe        (use as: `npm run deploy:probe; npm run build:hostinger` in a test deployment)
 * Answers the questions that decide whether `build:hostinger` is viable on Hostinger, WITHOUT changing anything:
 * Node version, devDependencies present, variable PRESENCE (never values), TCP/auth to MySQL, server version/collation,
 * the privileges needed by migrations, and whether the storage directories are visible/writable from the BUILD host.
 * Exit code is always 0 (it is informational); read the lines. Never prints hosts' credentials, URLs or secrets.
 */
import { existsSync } from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile(".env");
} catch {
  /* environment injected by the platform */
}

const line = (k: string, v: string | number | boolean) => console.log(`[probe] ${k}: ${v}`);
const root = path.resolve(import.meta.dirname, "..");

async function main() {
  line("node", process.version);
  line("platform", `${process.platform}/${process.arch}`);
  line("prisma cli present", existsSync(path.join(root, "node_modules/prisma/build/index.js")));
  line("tsx present", existsSync(path.join(root, "node_modules/tsx/dist/cli.mjs")));
  line("prisma/migrations present", existsSync(path.join(root, "prisma/migrations")));
  for (const n of ["DATABASE_URL", "SESSION_SECRET", "IP_HASH_SECRET", "MAINTENANCE_TOKEN", "SITE_URL", "STORAGE_DRIVER", "MEDIA_STORAGE_DIR", "PRIVATE_STORAGE_DIR", "BOOTSTRAP_OWNER_EMAIL", "BOOTSTRAP_OWNER_PASSWORD_HASH"]) {
    line(`env ${n}`, process.env[n] ? "set" : "unset");
  }
  const { parseDatabaseUrl, toConnectionOptions } = await import("../src/lib/db-url");
  let cfg;
  try {
    cfg = parseDatabaseUrl(process.env.DATABASE_URL);
    line("database host is 127.0.0.1", cfg.host === "127.0.0.1");
  } catch (e) {
    line("DATABASE_URL", `invalid (${e instanceof Error ? e.message : "error"})`);
    return;
  }
  const mariadb = await import("mariadb");
  try {
    const conn = await mariadb.createConnection({ ...toConnectionOptions(cfg), connectTimeout: 8000 });
    const v = (await conn.query("SELECT VERSION() AS v, @@collation_database AS c, @@character_set_database AS cs, @@lower_case_table_names AS l, @@max_connections AS mc, @@innodb_default_row_format AS rf"))[0];
    line("connection", "OK");
    line("server version", String(v.v));
    line("database charset/collation", `${v.cs}/${v.c}`);
    line("lower_case_table_names", String(v.l));
    line("max_connections", String(v.mc));
    line("innodb default row format", String(v.rf));
    const grants = ((await conn.query("SHOW GRANTS FOR CURRENT_USER()")) as Record<string, string>[]).map((r) => Object.values(r)[0]!).join(" ");
    for (const p of ["CREATE", "ALTER", "DROP", "INDEX", "REFERENCES", "INSERT", "UPDATE", "DELETE", "SELECT"]) {
      line(`privilege ${p}`, new RegExp(`\\b(ALL PRIVILEGES|${p})\\b`, "i").test(grants));
    }
    const lock = (await conn.query("SELECT GET_LOCK('batinova_probe', 1) AS ok"))[0];
    line("GET_LOCK works", Number(lock.ok) === 1);
    await conn.query("SELECT RELEASE_LOCK('batinova_probe')");
    await conn.end();
  } catch (e) {
    line("connection", `FAILED (${(e as { code?: string }).code ?? "error"})`);
  }
  for (const n of ["MEDIA_STORAGE_DIR", "PRIVATE_STORAGE_DIR"]) {
    const d = process.env[n];
    line(`${n} absolute`, !!d && path.isAbsolute(d));
    line(`${n} exists on this host`, !!d && existsSync(d));
    line(`${n} inside hbuilds/public_html`, !!d && /(^|\/)(hbuilds|public_html)(\/|$)/.test(d));
  }
}

main().then(
  () => process.exit(0),
  () => {
    console.log("[probe] failed unexpectedly");
    process.exit(0);
  },
);
