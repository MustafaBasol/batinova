// Hostinger creates databases with whatever default collation the panel/server uses (latin1, utf8mb4_general_ci,
// utf8mb4_0900_ai_ci...). The baseline migration must pin utf8mb4 + utf8mb4_unicode_ci per table so behaviour does not depend on it.
import { execFileSync } from "node:child_process";
import path from "node:path";
import * as mariadb from "mariadb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseDatabaseUrl, toConnectionOptions } from "@/lib/db-url";
import { assertTestDatabase, dropDatabase, testDatabaseUrl } from "../support/mysql";

const root = path.resolve(import.meta.dirname, "../..");
const u = new URL(testDatabaseUrl());
u.pathname = "/batinova_latin1_test";
const url = u.toString();
const cfg = parseDatabaseUrl(url);

beforeAll(async () => {
  assertTestDatabase(url);
  const admin = await mariadb.createConnection({ ...toConnectionOptions(cfg), database: undefined });
  await admin.query("DROP DATABASE IF EXISTS `batinova_latin1_test`");
  await admin.query("CREATE DATABASE `batinova_latin1_test` CHARACTER SET latin1 COLLATE latin1_swedish_ci");
  await admin.end();
  execFileSync(process.execPath, [path.join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}, 120_000);
afterAll(async () => dropDatabase(url));

describe("database created with a latin1 default", () => {
  it("every table and text column is still utf8mb4 / utf8mb4_unicode_ci", async () => {
    const c = await mariadb.createConnection(toConnectionOptions(cfg));
    try {
      const tables = (await c.query("SELECT table_name AS t, table_collation AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name <> '_prisma_migrations'")) as { t: string; c: string }[];
      expect(tables.length).toBeGreaterThan(15);
      expect(tables.filter((x) => x.c !== "utf8mb4_unicode_ci")).toEqual([]);
      const cols = (await c.query("SELECT table_name AS t, column_name AS n, collation_name AS c, data_type AS d FROM information_schema.columns WHERE table_schema = DATABASE() AND collation_name IS NOT NULL AND table_name <> '_prisma_migrations'")) as { t: string; n: string; c: string; d: string }[];
      // MariaDB stores JSON as LONGTEXT utf8mb4_bin (with a JSON_VALID check): that is the only accepted exception.
      expect(cols.filter((x) => x.c !== "utf8mb4_unicode_ci" && !(x.c === "utf8mb4_bin" && x.d === "longtext"))).toEqual([]);
      await c.query("INSERT INTO `Media` (id, storageKey, originalName, mime, sizeBytes, alt, licenseType, isPlaceholder, createdAt, updatedAt) VALUES ('m1','k/1.webp','Façade 🏗️.webp','image/webp',1,'Rénovation','UNKNOWN',0,NOW(3),NOW(3))");
      const r = (await c.query("SELECT originalName, alt FROM `Media` WHERE id='m1'")) as { originalName: string; alt: string }[];
      expect(r[0]).toEqual({ originalName: "Façade 🏗️.webp", alt: "Rénovation" });
    } finally {
      await c.end();
    }
  });
});
