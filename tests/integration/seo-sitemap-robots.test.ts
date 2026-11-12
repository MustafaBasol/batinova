/* eslint-disable @typescript-eslint/no-explicit-any -- tests inspect loosely typed Next Metadata / JSON-LD objects */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "../support/db";
import { getSitemapEntries } from "@/lib/seo/sitemap-data";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const HOUR = 3600_000;
const past = () => new Date(Date.now() - 24 * HOUR);
const future = () => new Date(Date.now() + 24 * HOUR);
const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] };

beforeEach(resetDb);
afterEach(() => vi.unstubAllEnvs());

const page = (path: string, data: Record<string, unknown> = {}) =>
  db.page.create({ data: { path, title: path || "home", blocks: [], status: "PUBLISHED", publishedAt: past(), ...data } });
const post = (slug: string, data: Record<string, unknown> = {}) =>
  db.post.create({ data: { slug, title: slug, body, status: "PUBLISHED", publishedAt: past(), ...data } });

describe("seo-sitemap: published, indexable, canonical content only", () => {
  it("lists published pages and excludes draft, future, deleted, noindex, placeholder", async () => {
    await page("");
    await page("a-propos");
    await page("services/renovation");
    await page("draft", { status: "DRAFT", publishedAt: null });
    await page("scheduled-future", { status: "SCHEDULED", publishedAt: null, scheduledAt: future() });
    await page("scheduled-due", { status: "SCHEDULED", publishedAt: null, scheduledAt: past() });
    await page("deleted", { deletedAt: past() });
    await page("hidden", { noindex: true });
    await page("demo", { isPlaceholder: true });
    await page("elsewhere", { canonicalPath: "/a-propos" });
    const urls = (await getSitemapEntries()).map((e) => e.url);
    expect(urls).toEqual(
      expect.arrayContaining(["https://btnv.fr", "https://btnv.fr/a-propos", "https://btnv.fr/services/renovation", "https://btnv.fr/scheduled-due"]),
    );
    for (const bad of ["draft", "scheduled-future", "deleted", "hidden", "demo", "elsewhere"]) {
      expect(urls).not.toContain(`https://btnv.fr/${bad}`);
    }
    expect(urls.every((u) => u.startsWith("https://btnv.fr"))).toBe(true);
    expect(urls.some((u) => u.includes("/admin") || u.includes("/devis/merci"))).toBe(false);
  });

  it("lists published posts and categories with >=1 published post; never tags, drafts or empty categories", async () => {
    const full = await db.category.create({ data: { slug: "budget-travaux", name: "Budget" } });
    await db.category.create({ data: { slug: "vide", name: "Vide" } });
    const onlyDraft = await db.category.create({ data: { slug: "brouillons", name: "Brouillons" } });
    const tag = await db.tag.create({ data: { slug: "budget", name: "Budget" } });
    const p = await post("publie", { categoryId: full.id });
    await db.postTag.create({ data: { postId: p.id, tagId: tag.id } });
    await post("brouillon", { status: "DRAFT", publishedAt: null, categoryId: onlyDraft.id });
    await post("planifie", { status: "SCHEDULED", publishedAt: null, scheduledAt: future() });
    await post("echu", { status: "SCHEDULED", publishedAt: null, scheduledAt: past() });
    await post("supprime", { deletedAt: past() });
    await post("noindex", { noindex: true });
    const urls = (await getSitemapEntries()).map((e) => e.url);
    expect(urls).toContain("https://btnv.fr/blog");
    expect(urls).toContain("https://btnv.fr/blog/publie");
    expect(urls).toContain("https://btnv.fr/blog/echu");
    expect(urls).toContain("https://btnv.fr/blog/categorie/budget-travaux");
    for (const bad of ["/blog/brouillon", "/blog/planifie", "/blog/supprime", "/blog/noindex", "/blog/categorie/vide", "/blog/categorie/brouillons", "/blog/etiquette/budget"]) {
      expect(urls).not.toContain(`https://btnv.fr${bad}`);
    }
  });

  it("has no blog entry when nothing is published, and uses updatedAt as lastModified", async () => {
    const pg = await page("a-propos");
    const entries = await getSitemapEntries();
    expect(entries.map((e) => e.url)).not.toContain("https://btnv.fr/blog");
    expect(entries.find((e) => e.url.endsWith("/a-propos"))!.lastModified).toEqual(pg.updatedAt);
  });

  it("the sitemap route is empty outside production and lists URLs when SITE_INDEXING=true", async () => {
    await page("a-propos");
    vi.stubEnv("SITE_INDEXING", "");
    expect(await sitemap()).toEqual([]);
    vi.stubEnv("SITE_INDEXING", "true");
    expect((await sitemap()).map((e) => e.url)).toContain("https://btnv.fr/a-propos");
  });
});

describe("seo-robots", () => {
  it("disallows admin/api/private and advertises the sitemap in production", () => {
    vi.stubEnv("SITE_INDEXING", "true");
    const r = robots() as any;
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.disallow).toEqual(expect.arrayContaining(["/admin", "/api/", "/media/private"]));
    expect(rule.disallow).not.toContain("/");
    expect(r.sitemap).toBe("https://btnv.fr/sitemap.xml");
  });
  it("blocks everything unless SITE_INDEXING is exactly 'true'", () => {
    for (const v of ["", "false", "1", "TRUE"]) {
      vi.stubEnv("SITE_INDEXING", v);
      const r = robots() as any;
      const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
      expect(rule.disallow).toBe("/");
      expect(r.sitemap).toBeUndefined();
    }
  });
});
