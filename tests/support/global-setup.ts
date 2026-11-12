// Creates a fresh, isolated SQLite test database from the committed migrations.
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const dbFile = path.join(root, "prisma", "test-vitest.db");

function clean() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(dbFile + suffix, { force: true });
  rmSync(path.join(root, ".tmp", "test-storage"), { recursive: true, force: true });
}

export default function setup() {
  clean();
  const prismaBin = path.join(root, "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaBin, "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: "file:./prisma/test-vitest.db" },
    stdio: "pipe",
  });
  return () => clean();
}
