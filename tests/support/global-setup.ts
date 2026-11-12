// Creates a fresh, isolated MySQL/MariaDB test database from the committed migrations (owner: qa-release).
// Default: mysql://batinova_test:batinova_test@127.0.0.1:3306/batinova_vitest_test (throwaway local credentials);
// override with TEST_DATABASE_URL. Database names must contain "test" (see tests/support/mysql.ts).
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { dropDatabase, recreateDatabase, testDatabaseUrl } from "./mysql";

const root = path.resolve(import.meta.dirname, "../..");

function clean() {
  rmSync(path.join(root, ".tmp", "test-storage"), { recursive: true, force: true });
}

export default async function setup() {
  clean();
  const url = testDatabaseUrl();
  await recreateDatabase(url);
  const prismaBin = path.join(root, "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  return async () => {
    clean();
    await dropDatabase(url);
  };
}
