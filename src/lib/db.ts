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

function getClient(): PrismaClient {
  return (globalForDb.__batinovaDb ??= createClient());
}

/**
 * Lazy: the client (and therefore DATABASE_URL parsing and the connection pool) is created on the FIRST query, never at
 * import time. `next build` imports route modules while collecting page data; with an eager client a build without
 * DATABASE_URL (CI, or a Hostinger build host without the variable) would fail even though no page needs the database then.
 * Runtime behaviour is unchanged: the first query still fails loudly when DATABASE_URL is missing or invalid.
 */
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has: (_target, prop) => Reflect.has(getClient(), prop),
});

export type { PrismaClient };
