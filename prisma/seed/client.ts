// Standalone Prisma client for CLI scripts (seed, admin:create). Owner: architect-security.
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "../../src/generated/prisma/client";
import { parseDatabaseUrl, toAdapterConfig } from "../../src/lib/db-url";

try {
  process.loadEnvFile(".env");
} catch {
  /* rely on the process environment */
}

export function createScriptClient(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaMariaDb(toAdapterConfig(parseDatabaseUrl(process.env.DATABASE_URL))) });
}

export type { PrismaClient };

export interface SeedContext {
  db: PrismaClient;
  log: (msg: string) => void;
}
