import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";
import { flushRedirectHits, invalidateRedirectCache, resolveRedirect } from "@/lib/seo/redirects";

beforeEach(async () => {
  await resetDb();
  invalidateRedirectCache();
});

describe("seo-redirects against the Redirect table", () => {
  it("resolves 301, 410 and counts hits", async () => {
    await db.redirect.create({ data: { fromPath: "/blog/ancien-slug", toPath: "/blog/nouveau-slug", statusCode: 301 } });
    await db.redirect.create({ data: { fromPath: "/page-supprimee", toPath: null, statusCode: 410 } });
    expect(await resolveRedirect("/blog/ancien-slug")).toEqual({ status: 301, to: "/blog/nouveau-slug" });
    expect(await resolveRedirect("/page-supprimee")).toEqual({ status: 410 });
    expect(await resolveRedirect("/blog/nouveau-slug")).toBeNull();
    await flushRedirectHits();
    expect((await db.redirect.findUnique({ where: { fromPath: "/blog/ancien-slug" } }))!.hits).toBe(1);
  });
  it("ignores loops stored in the table", async () => {
    await db.redirect.create({ data: { fromPath: "/a", toPath: "/b", statusCode: 301 } });
    await db.redirect.create({ data: { fromPath: "/b", toPath: "/a", statusCode: 301 } });
    expect(await resolveRedirect("/a")).toBeNull();
  });
});
