import "server-only";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@/generated/prisma/client";
import { parseDatabaseUrl, toAdapterConfig } from "@/lib/db-url";

/**
 * Prisma singleton (owner: architect-security). Reuses one client across
 * hot reloads in dev. Import `db` from server code only.
 */
function createClient(): PrismaClient {
  const adapter = new PrismaMariaDb(toAdapterConfig(parseDatabaseUrl(process.env.DATABASE_URL)));
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForDb = globalThis as unknown as { __batinovaDb?: PrismaClient };

export const db: PrismaClient = globalForDb.__batinovaDb ?? createClient();

if (process.env.NODE_ENV !== "production") globalForDb.__batinovaDb = db;

export type { PrismaClient };
