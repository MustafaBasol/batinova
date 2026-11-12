// Prisma 7 configuration (owner: architect-security).
// Prisma 7 no longer loads .env automatically: load it here with Node's
// built-in loader (no dotenv dependency). Missing .env is fine (CI / prod
// inject real environment variables).
import { defineConfig } from "prisma/config";

try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file — rely on the process environment */
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx --conditions=react-server prisma/seed/index.ts",
  },
  datasource: {
    // SQLite path is resolved relative to the project root (process cwd).
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db",
  },
});
