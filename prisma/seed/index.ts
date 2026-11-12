/**
 * Seed entry (`npm run db:seed`). Owner: architect-security.
 *
 * RULES for every seed module (see docs/CONTENT_REQUIREMENTS.md):
 *  - CREATE-IF-MISSING ONLY: `upsert({ where, create, update: {} })` or
 *    findUnique-then-create. Re-running must never overwrite owner edits,
 *    re-publish unpublished content or restore soft-deleted rows.
 *  - Seeded rows are ordinary rows: no locks, no special flags besides
 *    `isPlaceholder` for demo content.
 *  - Never create users here (use `npm run admin:create`).
 */
import { createScriptClient, type SeedContext } from "./client";
import { seedSettings } from "./settings";
import { seedPages } from "./pages";
import { seedNavigation } from "./navigation";
import { seedProjects } from "./projects";
import { seedBlog } from "./blog";

async function main() {
  const db = createScriptClient();
  const ctx: SeedContext = { db, log: (m) => console.log(`[seed] ${m}`) };
  try {
    await seedSettings(ctx); // architect-security
    await seedPages(ctx); // design-frontend
    await seedNavigation(ctx); // design-frontend (after pages: nav items may link pages)
    await seedProjects(ctx); // design-frontend
    await seedBlog(ctx); // seo-content
    ctx.log("done");
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("[seed] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
