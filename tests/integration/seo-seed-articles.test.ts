import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { INITIAL_ARTICLES, INITIAL_ARTICLE_SLUGS, seedBlogPosts } from "../../prisma/seed/blog";
import { publishUntouchedInitialArticles } from "../../prisma/seed/publish-initial-articles";
import { getSitemapEntries } from "@/lib/seo/sitemap-data";
import { getPublishedPostBySlug, listPublishedPosts } from "@/lib/content/public";
import { richTextToPlainText } from "@/lib/richtext/schema";

const ctx = () => ({ db, log: () => {} });
beforeEach(resetDb);

describe("initial articles seed (new installs)", () => {
  it("creates 3 PUBLISHED articles with a fixed past publishedAt, visible in listing, categories and sitemap", async () => {
    await seedBlogPosts(ctx());
    const rows = await db.post.findMany({ where: { slug: { in: [...INITIAL_ARTICLE_SLUGS] } } });
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.status).toBe("PUBLISHED");
      expect(r.updatedAt.getTime()).toBe(r.createdAt.getTime()); // untouched-row marker used by the opt-in script
      expect(r.publishedAt!.getTime()).toBeLessThan(Date.now());
      expect(r.publishedAt!.toISOString()).toBe(INITIAL_ARTICLES.find((a) => a.slug === r.slug)!.publishedAt);
    }
    const listing = await listPublishedPosts();
    expect(listing.items.map((p) => p.slug).sort()).toEqual([...INITIAL_ARTICLE_SLUGS].sort());
    const urls = (await getSitemapEntries()).map((e) => e.url);
    for (const s of INITIAL_ARTICLE_SLUGS) expect(urls).toContain(`https://btnv.fr/blog/${s}`);
    expect(urls).toContain("https://btnv.fr/blog");
    for (const c of ["conseils-renovation", "construction", "budget-travaux"]) {
      expect(urls).toContain(`https://btnv.fr/blog/categorie/${c}`);
      expect((await listPublishedPosts({ categorySlug: c })).total).toBe(1);
    }
  });

  it("is idempotent and never overwrites admin edits, trashed rows or status changes", async () => {
    await seedBlogPosts(ctx());
    const [s1, s2, s3] = INITIAL_ARTICLE_SLUGS;
    await db.post.update({ where: { slug: s1 }, data: { title: "Titre modifié par l’admin", status: "DRAFT", publishedAt: null } });
    await db.post.update({ where: { slug: s2 }, data: { deletedAt: new Date() } });
    await seedBlogPosts(ctx());
    expect(await db.post.count()).toBe(3);
    const a = await db.post.findUnique({ where: { slug: s1 } });
    expect(a).toMatchObject({ title: "Titre modifié par l’admin", status: "DRAFT", publishedAt: null });
    expect((await db.post.findUnique({ where: { slug: s2 } }))!.deletedAt).not.toBeNull();
    expect((await db.post.findUnique({ where: { slug: s3 } }))!.status).toBe("PUBLISHED");
  });
});

describe("content hygiene of the seeded articles", () => {
  it("has SEO-sized metadata, unique descriptions, a single H1 source and resolvable internal links", async () => {
    await seedBlogPosts(ctx());
    const rows = await db.post.findMany({ include: { category: true } });
    const descs = new Set<string>();
    const titles = new Set<string>();
    for (const r of rows) {
      expect(r.metaTitle!.length).toBeLessThanOrEqual(60);
      expect(r.metaDescription!.length).toBeGreaterThanOrEqual(110);
      expect(r.metaDescription!.length).toBeLessThanOrEqual(160);
      descs.add(r.metaDescription!);
      titles.add(r.metaTitle!);
      const json = JSON.stringify(r.body);
      expect(json).not.toContain('"level":1'); // H1 comes from the post title only
      const text = richTextToPlainText((await getPublishedPostBySlug(r.slug))!.body);
      expect(text).not.toMatch(/\d[\d\s]*(?:€|euros?)|décennale|\bRGE\b|qualibat|témoignage|\bavis clients?\b/i);
      for (const m of json.matchAll(/"href":"(\/[^"]*)"/g)) {
        const path = m[1]!.split(/[?#]/)[0]!;
        const ok =
          path.startsWith("/blog/") ||
          ["/devis", "/services/renovation", "/services/extension", "/services/construction", "/zones-intervention", "/zones-intervention/ile-de-france", "/zones-intervention/normandie", "/zones-intervention/manche"].includes(path);
        expect(ok, `unexpected internal link ${path} in ${r.slug}`).toBe(true);
        if (path.startsWith("/blog/")) expect(INITIAL_ARTICLE_SLUGS as readonly string[]).toContain(path.slice("/blog/".length));
      }
    }
    expect(descs.size).toBe(3);
    expect(titles.size).toBe(3);
  });
});

describe("publish-initial-articles (opt-in, unmodified drafts only)", () => {
  const seedDrafts = async () => {
    await seedBlogPosts(ctx());
    await db.post.updateMany({ data: { status: "DRAFT", publishedAt: null } });
    // updateMany bumps updatedAt: restore the "never edited" state that a legacy untouched draft has.
    const rows = await db.post.findMany();
    for (const r of rows) await db.$executeRaw`UPDATE Post SET updatedAt = createdAt WHERE id = ${r.id}`;
  };

  it("publishes untouched drafts with fixed dates and skips edited, trashed or revised ones", async () => {
    await seedDrafts();
    const [s1, s2, s3] = INITIAL_ARTICLE_SLUGS;
    await db.post.update({ where: { slug: s1 }, data: { excerpt: "édité" } }); // bumps updatedAt
    await db.post.update({ where: { slug: s2 }, data: { deletedAt: new Date() } });
    const report = await publishUntouchedInitialArticles(db);
    expect(report.published).toEqual([s3]);
    expect(report.skipped.map((s) => s.slug).sort()).toEqual([s1, s2].sort());
    const p3 = await db.post.findUnique({ where: { slug: s3 } });
    expect(p3!.status).toBe("PUBLISHED");
    expect(p3!.publishedAt!.toISOString()).toBe(INITIAL_ARTICLES.find((a) => a.slug === s3)!.publishedAt);
    expect((await db.post.findUnique({ where: { slug: s1 } }))!.status).toBe("DRAFT");
    // second run: nothing left to do
    expect((await publishUntouchedInitialArticles(db)).published).toEqual([]);
  });
});
