import "server-only";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma singleton (owner: architect-security). Reuses one client across
 * hot reloads in dev. Import `db` from server code only.
 */
function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForDb = globalThis as unknown as { __batinovaDb?: PrismaClient };

export const db: PrismaClient = globalForDb.__batinovaDb ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.__batinovaDb = db;

export type { PrismaClient };
