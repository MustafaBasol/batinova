/**
 * Deployment persistence canary (owner: architect-security).
 *   npm run storage:canary -- write   # BEFORE a deployment: stamps both storage roots
 *   npm run storage:canary -- check   # AFTER the deployment: fails (exit 1) if a stamp or marker vanished
 * Local driver only. Prints counts and scope names, never full paths or secrets.
 */
export {};

try {
  process.loadEnvFile(".env");
} catch {
  /* rely on the process environment */
}

async function main() {
  const mode = process.argv[2];
  if (mode !== "write" && mode !== "check") throw new Error("usage: storage:canary -- write|check");
  const { storageDriverKind } = await import("../src/lib/storage/config");
  if (storageDriverKind() !== "local") {
    console.log("[storage:canary] STORAGE_DRIVER is not local: nothing to check.");
    return;
  }
  const { storageRoots } = await import("../src/lib/storage/roots");
  const { assertWritable, initStorageRoot, listCanaries, readMarker, writeCanary } = await import("../src/lib/storage/persistence");
  const roots = storageRoots();
  let bad = 0;
  for (const [scope, root] of [["media", roots.pub], ["private", roots.priv]] as const) {
    if (mode === "write") {
      await initStorageRoot(root, scope);
      await assertWritable(root);
      const name = await writeCanary(root);
      console.log(`[storage:canary] ${scope}: wrote ${name}`);
    } else {
      const marker = await readMarker(root);
      const canaries = await listCanaries(root);
      const ok = !!marker && canaries.length > 0;
      if (!ok) bad++;
      console.log(`[storage:canary] ${scope}: marker=${marker ? "present" : "MISSING"} canaries=${canaries.length} ${ok ? "OK" : "FAILED"}`);
    }
  }
  if (bad) {
    console.error("[storage:canary] PERSISTENCE NOT PROVEN: do not use this directory in production.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[storage:canary] failed:", err instanceof Error ? err.message : "error");
  process.exit(1);
});
