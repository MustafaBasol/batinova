// MySQL/MariaDB helpers for tests (owner: qa-release). Test databases are throwaway and MUST have "test"
// in their name: the helpers refuse to drop anything else, so a real database can never be wiped by mistake.
import * as mariadb from "mariadb";
import { parseDatabaseUrl, toConnectionOptions } from "../../src/lib/db-url";

export const DEFAULT_TEST_DATABASE_URL = "mysql://batinova_test:batinova_test@127.0.0.1:3306/batinova_vitest_test";

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
}

export function assertTestDatabase(url: string): void {
  const cfg = parseDatabaseUrl(url);
  if (!/test/i.test(cfg.database)) throw new Error(`Refusing to touch database "${cfg.database}": test databases must have "test" in their name.`);
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_EPHEMERAL_PATHS !== "true") throw new Error("Refusing to run test DB helpers with NODE_ENV=production.");
}

const quote = (name: string) => "`" + name.replace(/`/g, "``") + "`";

/** Drops and recreates the (test) database so a run always starts from an empty schema. */
export async function recreateDatabase(url: string): Promise<void> {
  assertTestDatabase(url);
  const c = parseDatabaseUrl(url);
  const conn = await mariadb.createConnection({ ...toConnectionOptions(c), database: undefined });
  try {
    await conn.query(`DROP DATABASE IF EXISTS ${quote(c.database)}`);
    await conn.query(`CREATE DATABASE ${quote(c.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

export async function dropDatabase(url: string): Promise<void> {
  assertTestDatabase(url);
  const c = parseDatabaseUrl(url);
  const conn = await mariadb.createConnection({ ...toConnectionOptions(c), database: undefined });
  try {
    await conn.query(`DROP DATABASE IF EXISTS ${quote(c.database)}`);
  } finally {
    await conn.end();
  }
}

/** Read-only convenience query used by E2E assertions (UTC, plain objects). */
export async function queryDatabase<T = Record<string, unknown>>(url: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const c = parseDatabaseUrl(url);
  const conn = await mariadb.createConnection(toConnectionOptions(c));
  try {
    const rows = (await conn.query(sql, params)) as T[];
    return Array.from(rows);
  } finally {
    await conn.end();
  }
}
