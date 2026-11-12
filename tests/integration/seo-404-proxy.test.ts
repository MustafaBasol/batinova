import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db, resetDb } from "../support/db";
import { invalidateRedirectCache } from "@/lib/seo/redirects";
import { proxy } from "@/proxy";

const get = (path: string, method = "GET") => proxy(new NextRequest(`https://btnv.fr${path}`, { method }));
const past = () => new Date(Date.now() - 86_400_000);

beforeEach(async () => {
  await resetDb();
  invalidateRedirectCache();
  vi.stubEnv("SITE_INDEXING", "true");
  vi.stubEnv("CANONICAL_HOST", "");
});

describe("server-rendered 404 (Next 16.4 empty error shell workaround)", () => {
  it("answers unknown page/blog/project/category/tag URLs with 404, French HTML, home link and noindex", async () => {
    for (const p of ["/page-inconnue", "/services/rien", "/blog/rien", "/blog/categorie/rien", "/blog/etiquette/rien", "/realisations/rien", "/blog/a/b/c", "/%E0%A4%A"]) {
      const r = await get(p);
      expect(r.status, p).toBe(404);
      expect(r.headers.get("x-robots-tag")).toContain("noindex");
      const html = await r.text();
      expect(html).toContain('<html lang="fr">');
      expect(html).toContain("<h1>Cette page est introuvable.</h1>");
      expect(html).toContain('href="/"');
    }
    expect(await (await get("/page-inconnue", "HEAD")).text()).toBe("");
  });

  it("does not 404 published content, static routes or trashed-then-published rules", async () => {
    await db.page.create({ data: { path: "a-propos", title: "A", blocks: [], status: "PUBLISHED", publishedAt: past() } });
    await db.page.create({ data: { path: "brouillon", title: "B", blocks: [], status: "DRAFT" } });
    await db.post.create({ data: { slug: "mon-article", title: "T", excerpt: "e", body: {}, blocks: [], status: "PUBLISHED", publishedAt: past() } as never });
    await db.category.create({ data: { slug: "conseils", name: "Conseils" } });
    await db.project.create({ data: { slug: "projet-1", title: "P", blocks: [], status: "PUBLISHED", publishedAt: past() } });
    for (const p of ["/", "/blog", "/devis", "/realisations", "/a-propos", "/a-propos/", "/blog/mon-article", "/blog/categorie/conseils", "/realisations/projet-1", "/devis/merci"]) {
      const r = await get(p);
      expect(r.status, p).not.toBe(404);
    }
    expect((await get("/brouillon")).status).toBe(404); // unpublished is never public
  });
});
