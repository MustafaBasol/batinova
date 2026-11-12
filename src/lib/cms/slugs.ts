import { db } from "@/lib/db";
import { HOME_PATH, SLUG_MAX, isValidPagePath, isValidSlug, slugify, toPagePath, RESERVED_SEGMENTS } from "@/lib/content/paths";
import { CmsError } from "./result";

/** Safe unique French slugs / page paths (owner: cms-admin). Trashed rows still reserve their slug. */

export type SlugModel = "post" | "project" | "category" | "tag";

async function slugTaken(model: SlugModel, slug: string, excludeId?: string): Promise<boolean> {
  const where = { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) };
  switch (model) {
    case "post":
      return !!(await db.post.findFirst({ where, select: { id: true } }));
    case "project":
      return !!(await db.project.findFirst({ where, select: { id: true } }));
    case "category":
      return !!(await db.category.findFirst({ where, select: { id: true } }));
    case "tag":
      return !!(await db.tag.findFirst({ where, select: { id: true } }));
  }
}

function withSuffix(base: string, n: number): string {
  const suffix = `-${n}`;
  return `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
}

/** Slugifies `text` (accents stripped) and appends -2, -3… until unique. */
export async function uniqueSlug(model: SlugModel, text: string, excludeId?: string): Promise<string> {
  const base = slugify(text) || "sans-titre";
  let candidate = base;
  for (let n = 2; await slugTaken(model, candidate, excludeId); n++) {
    candidate = withSuffix(base, n);
    if (n > 500) throw new CmsError("Impossible de générer une adresse unique.");
  }
  return candidate;
}

/** Validates a user-provided slug (normalises accents/case) and refuses duplicates. */
export async function assertSlugAvailable(model: SlugModel, input: string, excludeId?: string): Promise<string> {
  const slug = slugify(input);
  if (!isValidSlug(slug)) {
    throw new CmsError("Adresse (slug) invalide.", { slug: "Lettres minuscules, chiffres et tirets uniquement (accents retirés automatiquement)." });
  }
  if (await slugTaken(model, slug, excludeId)) {
    throw new CmsError("Cette adresse est déjà utilisée (peut-être dans la corbeille).", { slug: "Adresse déjà utilisée." });
  }
  return slug;
}

/** "Services/Rénovation Énergétique/" -> "services/renovation-energetique". */
export function normalizePagePath(input: string): string {
  const cleaned = toPagePath(input.trim().replace(/^\/+|\/+$/g, "").split("/").map((s) => slugify(s)).filter(Boolean));
  return cleaned;
}

export async function assertPagePathAvailable(path: string, excludeId?: string): Promise<void> {
  if (path !== HOME_PATH && !isValidPagePath(path)) {
    const first = path.split("/")[0] ?? "";
    throw new CmsError(RESERVED_SEGMENTS.has(first) ? `« ${first} » est réservé au système.` : "Adresse de page invalide.", {
      path: RESERVED_SEGMENTS.has(first)
        ? `« ${first} » est un nom réservé, choisissez-en un autre.`
        : "1 à 4 segments en minuscules séparés par « / » (ex. services/renovation).",
    });
  }
  const clash = await db.page.findFirst({ where: { path, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true, deletedAt: true } });
  if (clash) {
    throw new CmsError(clash.deletedAt ? "Cette adresse est utilisée par une page de la corbeille." : "Cette adresse est déjà utilisée.", {
      path: clash.deletedAt ? "Adresse prise par une page supprimée (restaurez-la ou purgez-la)." : "Adresse déjà utilisée.",
    });
  }
}

export async function uniquePagePath(basePath: string, excludeId?: string): Promise<string> {
  let candidate = basePath;
  for (let n = 2; await db.page.findFirst({ where: { path: candidate, ...(excludeId ? { NOT: { id: excludeId } } : {}) }, select: { id: true } }); n++) {
    candidate = withSuffix(basePath, n);
    if (n > 500) throw new CmsError("Impossible de générer une adresse unique.");
  }
  return candidate;
}
