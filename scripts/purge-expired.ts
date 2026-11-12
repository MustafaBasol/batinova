/**
 * Daily retention purge (cron). Owner: cms-admin / architect-security.
 *   npm run maintenance:purge
 * Deletes leads past their retention date (+ attachments), expired sessions and stale rate-limit buckets.
 * Prints counts only (no personal data). Exit code 1 on failure.
 */
export {};

try {
  process.loadEnvFile(".env");
} catch {
  /* rely on the process environment */
}

async function main() {
  const { runRetentionPurge } = await import("../src/lib/maintenance");
  const s = await runRetentionPurge({ actorId: null });
  console.log(`[maintenance:purge] ${new Date().toISOString()} leads=${s.leads} sessions=${s.sessions} rateLimitBuckets=${s.rateLimitBuckets}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[maintenance:purge] failed:", err instanceof Error ? err.message : "error");
    process.exit(1);
  },
);
