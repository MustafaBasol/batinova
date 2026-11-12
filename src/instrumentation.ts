/**
 * Fail-fast production configuration check (owner: architect-security). Runs once when the Node server
 * starts (`next start`), NOT during `next build` (secrets are runtime-only).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertProductionEnv } = await import("@/lib/config/production");
  assertProductionEnv();
  if (process.env.NODE_ENV === "production") {
    // Refuse to serve with a wiped / unmounted storage directory (Hostinger deployments overwrite hbuilds/).
    const { assertStoragePersistence } = await import("@/lib/storage/startup-check");
    await assertStoragePersistence();
    // First OWNER from BOOTSTRAP_OWNER_* (hash only). Inert once an OWNER exists; never blocks start-up.
    try {
      const { db } = await import("@/lib/db");
      const { bootstrapOwner } = await import("@/lib/auth/bootstrap");
      const b = await bootstrapOwner(db);
      if (b.result !== "disabled") console.warn(`[bootstrap] owner: ${b.result}${b.warning ? ` — ${b.warning}` : ""}`);
    } catch {
      console.error("[bootstrap] owner bootstrap skipped (database not ready)");
    }
  }
}
