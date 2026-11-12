// Standalone Prisma client for CLI scripts (seed, admin:create). Owner: architect-security.
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  /* rely on the process environment */
}

export function createScriptClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

export type { PrismaClient };

export interface SeedContext {
  db: PrismaClient;
  log: (msg: string) => void;
}
