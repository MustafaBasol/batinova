import "server-only";
import { db } from "@/lib/db";
import { absoluteUrl } from "@/lib/config/site";
import { notDeleted, publishedWhere } from "@/lib/content/publish";
import { blogIndexUrl, categoryUrl, pageUrl, postUrl, projectUrl, projectsIndexUrl } from "@/lib/content/paths";
import { seoImageFromMedia } from "./media";

/**
 * Sitemap entries (owner: seo-content). Uses `publishedWhere` (the single publication rule) directly
 * because public.ts does not expose noindex/updatedAt for every entity. Only canonical, indexable URLs:
 *  - published, not deleted, not scheduled-in-the-future;
 *  - not noindex, not placeholder (those are noindex in <head>), no custom canonicalPath pointing elsewhere;
 *  - categories only when they hold >= 1 published post; tag archives are noindex and never listed.
 */
export interface SitemapEntry {
  url: string;
  lastModified?: Date;
  changeFrequency?: "daily" | "weekly" | "monthly" | "yearly";
  priority?: number;
  images?: string[];
}

const maxDate = (dates: Date[], fallback = new Date(0)) => dates.reduce((a, b) => (b > a ? b : a), fallback);

export async function getSitemapEntries(now: Date = new Date()): Promise<SitemapEntry[]> {
  const where = publishedWhere(now);
  const [pages, posts, categories, projects] = await Promise.all([
    db.page.findMany({
      where: { ...where, noindex: false, isPlaceholder: false },
      select: { path: true, updatedAt: true, canonicalPath: true },
      orderBy: { path: "asc" },
    }),
    db.post.findMany({
      where: { ...where, noindex: false, isPlaceholder: false },
      select: {
        slug: true,
        updatedAt: true,
        canonicalPath: true,
        categoryId: true,
        coverImage: { select: { storageKey: true, width: true, height: true, alt: true, variants: true, deletedAt: true } },
        ogImage: { select: { storageKey: true, width: true, height: true, alt: true, variants: true, deletedAt: true } },
      },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    }),
    db.category.findMany({
      where: { ...notDeleted, noindex: false },
      select: { id: true, slug: true, updatedAt: true, canonicalPath: true },
      orderBy: { slug: "asc" },
    }),
    db.project.findMany({
      where: { ...where, noindex: false, isPlaceholder: false },
      select: { slug: true, updatedAt: true, canonicalPath: true, coverImage: { select: { storageKey: true, width: true, height: true, alt: true, variants: true, deletedAt: true } } },
      orderBy: { slug: "asc" },
    }),
  ]);

  const out: SitemapEntry[] = [];
  const selfCanonical = (c: string | null, own: string) => !c || c === own || c === absoluteUrl(own);

  for (const p of pages) {
    const own = pageUrl(p.path);
    if (!selfCanonical(p.canonicalPath, own)) continue;
    out.push({
      url: absoluteUrl(own),
      lastModified: p.updatedAt,
      changeFrequency: p.path === "" ? "weekly" : "monthly",
      priority: p.path === "" ? 1 : p.path.split("/").length === 1 ? 0.8 : 0.7,
    });
  }
  // Code routes that are always indexable.
  out.push({ url: absoluteUrl("/devis"), changeFrequency: "yearly", priority: 0.6 });

  if (posts.length > 0) {
    out.push({
      url: absoluteUrl(blogIndexUrl()),
      lastModified: maxDate(posts.map((p) => p.updatedAt)),
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }
  const postsByCat = new Map<string, Date[]>();
  for (const p of posts) {
    const own = postUrl(p.slug);
    if (p.categoryId) postsByCat.set(p.categoryId, [...(postsByCat.get(p.categoryId) ?? []), p.updatedAt]);
    if (!selfCanonical(p.canonicalPath, own)) continue;
    const media = [p.ogImage, p.coverImage].find((m) => m && !m.deletedAt);
    const img = seoImageFromMedia(media);
    out.push({
      url: absoluteUrl(own),
      lastModified: p.updatedAt,
      changeFrequency: "monthly",
      priority: 0.6,
      images: img ? [img.url] : undefined,
    });
  }
  for (const c of categories) {
    const dates = postsByCat.get(c.id);
    if (!dates?.length || !selfCanonical(c.canonicalPath, categoryUrl(c.slug))) continue;
    out.push({ url: absoluteUrl(categoryUrl(c.slug)), lastModified: maxDate(dates), changeFrequency: "weekly", priority: 0.5 });
  }

  if (projects.length > 0) {
    out.push({
      url: absoluteUrl(projectsIndexUrl()),
      lastModified: maxDate(projects.map((p) => p.updatedAt)),
      changeFrequency: "monthly",
      priority: 0.7,
    });
    for (const p of projects) {
      const own = projectUrl(p.slug);
      if (!selfCanonical(p.canonicalPath, own)) continue;
      const img = p.coverImage && !p.coverImage.deletedAt ? seoImageFromMedia(p.coverImage) : null;
      out.push({ url: absoluteUrl(own), lastModified: p.updatedAt, changeFrequency: "monthly", priority: 0.6, images: img ? [img.url] : undefined });
    }
  }
  return out;
}
