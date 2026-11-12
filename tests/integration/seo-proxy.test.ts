import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { db, resetDb } from "../support/db";
import { invalidateRedirectCache } from "@/lib/seo/redirects";
import { proxy } from "@/proxy";

const req = (url: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(url, { method: init.method ?? "GET", headers: init.headers });

beforeEach(async () => {
  await resetDb();
  invalidateRedirectCache();
  vi.stubEnv("SITE_INDEXING", "true");
  vi.stubEnv("CANONICAL_HOST", "btnv.fr");
});
afterEach(() => vi.unstubAllEnvs());

describe("seo-proxy: host, redirects, 410, noindex", () => {
  it("301-redirects www to the apex origin keeping path and query, only for GET/HEAD", async () => {
    const r = await proxy(req("https://www.btnv.fr/blog/x?page=2", { headers: { host: "www.btnv.fr" } }));
    expect(r.status).toBe(301);
    expect(r.headers.get("location")).toBe("https://btnv.fr/blog/x?page=2");
    const post = await proxy(req("https://www.btnv.fr/devis", { method: "POST", headers: { host: "www.btnv.fr" } }));
    expect(post.headers.get("location")).toBeNull();
  });

  it("does not redirect the apex or an unconfigured host (localhost, previews)", async () => {
    expect((await proxy(req("https://btnv.fr/", { headers: { host: "btnv.fr" } }))).headers.get("location")).toBeNull();
    vi.stubEnv("CANONICAL_HOST", "");
    expect((await proxy(req("https://www.btnv.fr/", { headers: { host: "www.btnv.fr" } }))).headers.get("location")).toBeNull();
  });

  it("answers DB redirects (query preserved) and 410 Gone with noindex and an empty body for HEAD", async () => {
    await db.redirect.create({ data: { fromPath: "/ancien-slug", toPath: "/blog/nouveau-slug", statusCode: 301 } });
    await db.redirect.create({ data: { fromPath: "/supprime", toPath: null, statusCode: 410 } });
    const moved = await proxy(req("https://btnv.fr/ancien-slug/?utm=x"));
    expect(moved.status).toBe(301);
    expect(new URL(moved.headers.get("location")!).pathname).toBe("/blog/nouveau-slug");
    const gone = await proxy(req("https://btnv.fr/supprime"));
    expect(gone.status).toBe(410);
    expect(gone.headers.get("x-robots-tag")).toContain("noindex");
    expect(await gone.text()).toContain("Contenu supprimé");
    const head = await proxy(req("https://btnv.fr/supprime", { method: "HEAD" }));
    expect(head.status).toBe(410);
    expect(await head.text()).toBe("");
  });

  it("marks admin responses noindex and sends logged-out visitors to the login page", async () => {
    const r = await proxy(req("https://btnv.fr/admin/articles"));
    expect(r.status).toBe(307);
    expect(new URL(r.headers.get("location")!).pathname).toBe("/admin/login");
    expect(r.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("adds X-Robots-Tag noindex everywhere unless SITE_INDEXING=true", async () => {
    await db.page.create({ data: { path: "a-propos", title: "A propos", blocks: [], status: "PUBLISHED" } });
    expect((await proxy(req("https://btnv.fr/a-propos"))).headers.get("x-robots-tag")).toBeNull();
    vi.stubEnv("SITE_INDEXING", "false");
    expect((await proxy(req("https://btnv.fr/a-propos"))).headers.get("x-robots-tag")).toContain("noindex");
  });
});
