/**
 * OPT-IN: publishes the three initial articles on a database where they were seeded as DRAFT (older installs).
 * Run explicitly: `npm run content:publish-initial` (never part of `db:seed`).
 *
 * Safety rules (an article is published ONLY when ALL hold, otherwise it is skipped and reported):
 *  - found by its seeded slug, not soft-deleted, status DRAFT, publishedAt null, scheduledAt null;
 *  - never edited since the seed: updatedAt === createdAt, no revision rows, no updatedById;
 *  - title still equal to the seeded title.
 * Admin-edited, trashed, scheduled or already published rows are never modified. Fixed publishedAt dates.
 */
import { createScriptClient, type PrismaClient } from "./client";
import { INITIAL_ARTICLES } from "./blog";

export interface PublishReport {
  published: string[];
  skipped: { slug: string; reason: string }[];
}

export async function publishUntouchedInitialArticles(db: PrismaClient): Promise<PublishReport> {
  const report: PublishReport = { published: [], skipped: [] };
  for (const a of INITIAL_ARTICLES) {
    const row = await db.post.findUnique({
      where: { slug: a.slug },
      select: { id: true, title: true, status: true, publishedAt: true, scheduledAt: true, deletedAt: true, createdAt: true, updatedAt: true, updatedById: true, _count: { select: { revisions: true } } },
    });
    const skip = (reason: string) => report.skipped.push({ slug: a.slug, reason });
    if (!row) skip("absent");
    else if (row.deletedAt) skip("dans la corbeille");
    else if (row.status !== "DRAFT" || row.publishedAt || row.scheduledAt) skip(`statut ${row.status} (non brouillon vierge)`);
    else if (row.updatedAt.getTime() !== row.createdAt.getTime() || row._count.revisions > 0 || row.updatedById) skip("modifié depuis le seed");
    else if (row.title !== a.title) skip("titre modifié");
    else {
      // Guarded write: the where clause re-checks the untouched state to avoid racing an admin edit.
      const res = await db.post.updateMany({
        where: { id: row.id, status: "DRAFT", updatedAt: row.updatedAt, deletedAt: null },
        data: { status: "PUBLISHED", publishedAt: new Date(a.publishedAt) },
      });
      if (res.count === 1) report.published.push(a.slug);
      else skip("modifié pendant l’exécution");
    }
  }
  return report;
}

async function main() {
  const db = createScriptClient();
  try {
    const r = await publishUntouchedInitialArticles(db);
    for (const s of r.published) console.log(`[publish] publié : ${s}`);
    for (const s of r.skipped) console.log(`[publish] ignoré : ${s.slug} (${s.reason})`);
    console.log(`[publish] ${r.published.length} publié(s), ${r.skipped.length} ignoré(s)`);
  } finally {
    await db.$disconnect();
  }
}

// Only run as a CLI (importing it from tests must not execute main).
if (process.argv[1]?.replaceAll("\\", "/").includes("publish-initial-articles")) {
  main().catch((err) => {
    console.error("[publish] failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
