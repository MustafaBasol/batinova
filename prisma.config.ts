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
    // mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE (Hostinger MySQL). Required for migrate commands.
    url: process.env.DATABASE_URL ?? "mysql://root@127.0.0.1:3306/batinova_dev",
  },
});
