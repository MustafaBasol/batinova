/**
 * Fail-fast production configuration check (owner: architect-security). Runs once when the Node server
 * starts (`next start`), NOT during `next build` (secrets are runtime-only).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { assertProductionEnv } = await import("@/lib/config/production");
  assertProductionEnv();
}
