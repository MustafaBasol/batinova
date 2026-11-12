import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, db } from "../support/db";
import {
  getMediaByIds,
  getPublishedPageByPath,
  getPublishedPostBySlug,
  getPublishedProjectBySlug,
  listCategories,
  listNavItems,
  listPublishedPages,
  listPublishedPosts,
  listPublishedProjects,
} from "@/lib/content/public";
import { publishedWhere } from "@/lib/content/publish";
import { emptyDoc } from "@/lib/richtext/schema";

const HOUR = 3600_000;
const past = () => new Date(Date.now() - 24 * HOUR);
const future = () => new Date(Date.now() + 24 * HOUR);

beforeEach(resetDb);

describe("publishedWhere against the database", () => {
  it("excludes draft, archived, future-scheduled and soft-deleted; includes due scheduled", async () => {
    const mk = (path: string, data: Record<string, unknown>) =>
      db.page.create({ data: { path, title: path, blocks: [], ...data } });
    await mk("draft", { status: "DRAFT" });
    await mk("archived", { status: "ARCHIVED", publishedAt: past() });
    await mk("published", { status: "PUBLISHED", publishedAt: past() });
    await mk("future-published", { status: "PUBLISHED", publishedAt: future() });
    await mk("scheduled-future", { status: "SCHEDULED", scheduledAt: future() });
    await mk("scheduled-due", { status: "SCHEDULED", scheduledAt: past() });
    await mk("deleted", { status: "PUBLISHED", publishedAt: past(), deletedAt: past() });

    const rows = await db.page.findMany({ where: publishedWhere(), orderBy: { path: "asc" } });
    expect(rows.map((r) => r.path)).toEqual(["published", "scheduled-due"]);
    expect((await listPublishedPages()).map((p) => p.path)).toEqual(["published", "scheduled-due"]);
    expect(await getPublishedPageByPath("draft")).toBeNull();
    expect(await getPublishedPageByPath("deleted")).toBeNull();
    expect(await getPublishedPageByPath("scheduled-due")).not.toBeNull();
  });

  it("drops invalid blocks when reading a public page and hides a non-public parent", async () => {
    const parent = await db.page.create({ data: { path: "services", title: "Services", blocks: [], status: "DRAFT" } });
    await db.page.create({
      data: {
        path: "services/renovation",
        title: "Rénovation",
        status: "PUBLISHED",
        parentId: parent.id,
        blocks: [{ type: "hero", heading: "Rénovation" }, { type: "ctaBand", heading: "x", label: "y", href: "javascript:alert(1)" }],
      },
    });
    const page = await getPublishedPageByPath("services/renovation");
    expect(page?.blocks.map((b) => b.type)).toEqual(["hero"]);
    expect(page?.parent).toBeNull();
  });
});

describe("posts, categories, tags, projects", () => {
  it("lists only public posts, respects soft-deleted categories/tags and normalizes body", async () => {
    const cat = await db.category.create({ data: { slug: "renovation", name: "Rénovation" } });
    const delCat = await db.category.create({ data: { slug: "old", name: "Old", deletedAt: past() } });
    const tag = await db.tag.create({ data: { slug: "budget", name: "Budget" } });
    const delTag = await db.tag.create({ data: { slug: "gone", name: "Gone", deletedAt: past() } });
    const body = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };
    await db.post.create({
      data: {
        slug: "public",
        title: "Public",
        body,
        status: "PUBLISHED",
        publishedAt: past(),
        categoryId: cat.id,
        tags: { create: [{ tagId: tag.id }, { tagId: delTag.id }] },
      },
    });
    await db.post.create({ data: { slug: "in-deleted-cat", title: "x", body, status: "PUBLISHED", publishedAt: past(), categoryId: delCat.id } });
    await db.post.create({ data: { slug: "draft", title: "Draft", body, status: "DRAFT", categoryId: cat.id } });
    await db.post.create({ data: { slug: "trashed", title: "Trash", body, status: "PUBLISHED", publishedAt: past(), deletedAt: past() } });
    await db.post.create({ data: { slug: "evil", title: "Evil", body: { type: "doc", content: [{ type: "html" }] }, status: "PUBLISHED" } });

    const all = await listPublishedPosts();
    expect(all.items.map((p) => p.slug).sort()).toEqual(["evil", "in-deleted-cat", "public"]);
    expect(all.items.find((p) => p.slug === "in-deleted-cat")?.category).toBeNull();
    expect((await listPublishedPosts({ categorySlug: "renovation" })).items.map((p) => p.slug)).toEqual(["public"]);
    expect((await listPublishedPosts({ tagSlug: "gone" })).total).toBe(0);
    expect(await getPublishedPostBySlug("draft")).toBeNull();
    expect(await getPublishedPostBySlug("trashed")).toBeNull();
    const post = await getPublishedPostBySlug("public");
    expect(post?.tags).toEqual([{ slug: "budget", name: "Budget" }]);
    expect((await getPublishedPostBySlug("evil"))?.body).toEqual(emptyDoc());

    const cats = await listCategories();
    expect(cats).toEqual([{ slug: "renovation", name: "Rénovation", description: null, postCount: 1 }]);
  });

  it("projects: filters by region and excludes deleted media", async () => {
    const m1 = await db.media.create({ data: { storageKey: "2026/11/a.webp", originalName: "a.webp", mime: "image/webp", sizeBytes: 1 } });
    const m2 = await db.media.create({ data: { storageKey: "2026/11/b.webp", originalName: "b.webp", mime: "image/webp", sizeBytes: 1, deletedAt: past() } });
    await db.project.create({
      data: {
        slug: "manche-1",
        title: "M",
        region: "MANCHE",
        blocks: [],
        status: "PUBLISHED",
        media: { create: [{ mediaId: m1.id, sortOrder: 1 }, { mediaId: m2.id, sortOrder: 0 }] },
      },
    });
    await db.project.create({ data: { slug: "idf-draft", title: "I", region: "ILE_DE_FRANCE", blocks: [], status: "DRAFT" } });
    await db.project.create({ data: { slug: "idf-del", title: "D", region: "ILE_DE_FRANCE", blocks: [], status: "PUBLISHED", deletedAt: past() } });

    expect((await listPublishedProjects()).map((p) => p.slug)).toEqual(["manche-1"]);
    expect(await listPublishedProjects({ region: "ILE_DE_FRANCE" })).toEqual([]);
    const p = await getPublishedProjectBySlug("manche-1");
    expect(p?.media.map((x) => x.media.id)).toEqual([m1.id]);
    expect(await getPublishedProjectBySlug("idf-del")).toBeNull();
    const media = await getMediaByIds([m1.id, m2.id]);
    expect([...media.keys()]).toEqual([m1.id]);
  });
});

describe("navigation", () => {
  it("hides items linked to non-public pages and unsafe hrefs", async () => {
    const pub = await db.page.create({ data: { path: "contact", title: "Contact", blocks: [], status: "PUBLISHED" } });
    const draft = await db.page.create({ data: { path: "secret", title: "Secret", blocks: [], status: "DRAFT" } });
    const parent = await db.navItem.create({ data: { location: "HEADER", label: "Contact", pageId: pub.id, sortOrder: 2 } });
    await db.navItem.create({ data: { location: "HEADER", label: "Sub", href: "/contact#devis", parentId: parent.id } });
    await db.navItem.create({ data: { location: "HEADER", label: "Secret", pageId: draft.id, sortOrder: 1 } });
    await db.navItem.create({ data: { location: "HEADER", label: "Evil", href: "javascript:alert(1)" } });
    await db.navItem.create({ data: { location: "HEADER", label: "Off", href: "/x", enabled: false } });
    await db.navItem.create({ data: { location: "FOOTER_LEGAL", label: "Mentions", href: "/mentions-legales" } });

    const header = await listNavItems("HEADER");
    expect(header).toEqual([
      { id: parent.id, label: "Contact", href: "/contact", openInNewTab: false, children: [expect.objectContaining({ href: "/contact#devis" })] },
    ]);
    expect((await listNavItems("FOOTER_LEGAL")).map((i) => i.href)).toEqual(["/mentions-legales"]);
  });
});

describe("soft delete keeps rows restorable", () => {
  it("restoring clears deletedAt and makes the page public again", async () => {
    const page = await db.page.create({ data: { path: "a-propos", title: "À propos", blocks: [], status: "PUBLISHED", deletedAt: past(), deletedById: "u1" } });
    expect(await getPublishedPageByPath("a-propos")).toBeNull();
    await db.page.update({ where: { id: page.id }, data: { deletedAt: null, deletedById: null } });
    expect(await getPublishedPageByPath("a-propos")).not.toBeNull();
  });
});
