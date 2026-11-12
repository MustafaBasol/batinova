// Stock media seed (design-frontend). Imports assets/stock/manifest.json through the media pipeline.
// Create-if-missing by originalName; every image is STOCK_FREE + isPlaceholder (illustration, never a BatiNova project).
// Called from seedPages() so it always runs BEFORE the page seed (no change to prisma/seed/index.ts needed).
import fs from "node:fs";
import path from "node:path";
import { createMediaFromBuffer } from "../../src/lib/media/service";
import type { SeedContext } from "./client";

interface ManifestImage {
  file: string;
  altFr: string;
  photographer: string;
  sourcePageUrl: string;
  originalUnsplashUrl?: string;
  licence: string;
  licenceUrl: string;
}

const STOCK_DIR = path.resolve("assets/stock");

export async function seedMedia({ db, log }: SeedContext): Promise<void> {
  const manifestPath = path.join(STOCK_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    log("media: no assets/stock/manifest.json, skipped");
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { images: ManifestImage[] };
  let created = 0;
  for (const img of manifest.images) {
    const existing = await db.media.findFirst({ where: { originalName: img.file } });
    if (existing) continue;
    const file = path.join(STOCK_DIR, img.file);
    if (!fs.existsSync(file)) {
      log(`media: ${img.file} missing on disk, skipped`);
      continue;
    }
    try {
      await createMediaFromBuffer({
        buffer: fs.readFileSync(file),
        originalName: img.file,
        alt: img.altFr,
        credit: `Photo : ${img.photographer} / Unsplash`,
        licenseType: "STOCK_FREE",
        licenseSource: img.sourcePageUrl,
        licenseNotes: `${img.licence}. Illustration libre de droits, sans lien avec un chantier BatiNova.`,
        isPlaceholder: true,
        declaredMime: "image/jpeg",
      });
      created++;
    } catch (err) {
      log(`media: ${img.file} failed (${err instanceof Error ? err.message : "error"})`);
    }
  }
  log(`media: ${created} image(s) created`);
}

/** Media id by original file name (null when not seeded: callers skip the image gracefully). */
export async function mediaIdByName({ db }: SeedContext, file: string): Promise<string | null> {
  const m = await db.media.findFirst({ where: { originalName: file, deletedAt: null }, select: { id: true } });
  return m?.id ?? null;
}
