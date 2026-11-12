import path from "node:path";
import { defineConfig } from "vitest/config";

// Owner: architect-security. Conservative concurrency (shared dev workstation);
// integration tests share one isolated SQLite file, so files run sequentially.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    globalSetup: ["tests/support/global-setup.ts"],
    setupFiles: ["tests/support/setup.ts"],
    maxWorkers: 2,
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "file:./prisma/test-vitest.db",
      SESSION_SECRET: "test-session-secret-0123456789-abcdefghijklmnop",
      IP_HASH_SECRET: "test-iphash-secret-0123456789-abcdefghijklmnopq",
      MEDIA_STORAGE_DIR: "./.tmp/test-storage/media",
      PRIVATE_STORAGE_DIR: "./.tmp/test-storage/private",
      SITE_URL: "https://btnv.fr",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      MAIL_FROM: "",
    },
  },
});
