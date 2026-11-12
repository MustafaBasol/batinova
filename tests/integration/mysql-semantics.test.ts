// MySQL/MariaDB-specific behaviour that SQLite hid (owner: qa-release): collation, long text, utf8mb4,
// unique indexes, dates, JSON, transactions and atomic counters.
import { beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "../support/db";

beforeEach(resetDb);

const page = (path: string, extra: Record<string, unknown> = {}) => ({ path, title: `T ${path}`, blocks: [], ...extra });

describe("text columns", () => {
  it("stores long text (20k chars) and wide VARCHAR values without truncation", async () => {
    const long = "é".repeat(20_000);
    const lead = await db.lead.create({
      data: { name: "N", email: "a@b.fr", postalCode: "93600", projectType: "renovation", message: long, consentAt: new Date(), consentTextVersion: "v1", retentionUntil: new Date(Date.now() + 1e9) },
    });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).message).toBe(long);
    const p = await db.page.create({ data: page("long-meta", { metaDescription: "d".repeat(5000), metaTitle: "m".repeat(255) }) });
    expect(p.metaDescription).toHaveLength(5000);
  });

  it("rejects a VARCHAR overflow loudly instead of truncating (title is VARCHAR(255))", async () => {
    await expect(db.page.create({ data: page("too-long", { title: "x".repeat(256) }) })).rejects.toThrow();
  });

  it("is utf8mb4: accents, emoji and non-BMP characters round-trip", async () => {
    const title = "Rénovation à Aulnay-sous-Bois — « Construire autrement » 🏗️ 𝒜";
    const p = await db.page.create({ data: page("utf8", { title }) });
    expect((await db.page.findUniqueOrThrow({ where: { id: p.id } })).title).toBe(title);
  });
});

describe("unique indexes and collation", () => {
  it("home page path '' is unique and distinct from other paths", async () => {
    await db.page.create({ data: page("") });
    await expect(db.page.create({ data: page("") })).rejects.toThrow(/Unique/);
    await db.page.create({ data: page("a-propos") });
  });

  it("slug/path/e-mail uniqueness is case-insensitive (callers store lower-case values)", async () => {
    await db.page.create({ data: page("services/renovation") });
    await expect(db.page.create({ data: page("Services/Renovation") })).rejects.toThrow(/Unique/);
    await db.user.create({ data: { email: "owner@example.test", name: "O", passwordHash: "x" } });
    await expect(db.user.create({ data: { email: "OWNER@example.test", name: "O2", passwordHash: "x" } })).rejects.toThrow(/Unique/);
  });

  it("search with `contains` is case- and accent-insensitive (French-friendly)", async () => {
    await db.media.create({ data: { storageKey: "2026/11/a.webp", originalName: "Façade-Rénovée.webp", mime: "image/webp", sizeBytes: 1, alt: "Façade rénovée" } });
    const hit = async (q: string) => (await db.media.findMany({ where: { OR: [{ alt: { contains: q } }, { originalName: { contains: q } }] } })).length;
    expect(await hit("facade")).toBe(1);
    expect(await hit("RENOVEE")).toBe(1);
    expect(await hit("absent")).toBe(0);
  });

  it("compound unique (projectId, mediaId, role) is enforced", async () => {
    const m = await db.media.create({ data: { storageKey: "2026/11/b.webp", originalName: "b", mime: "image/webp", sizeBytes: 1 } });
    const pr = await db.project.create({ data: { slug: "p1", title: "P", blocks: [] } });
    await db.projectMedia.create({ data: { projectId: pr.id, mediaId: m.id } });
    await expect(db.projectMedia.create({ data: { projectId: pr.id, mediaId: m.id } })).rejects.toThrow(/Unique/);
  });
});

describe("dates, JSON, transactions", () => {
  it("DateTime round-trips as the same UTC instant with millisecond precision", async () => {
    const at = new Date("2026-11-12T23:59:59.123Z");
    const l = await db.session.create({ data: { tokenHash: "h".repeat(64), expiresAt: at, user: { create: { email: "t@example.test", name: "T", passwordHash: "x" } } } });
    expect((await db.session.findUniqueOrThrow({ where: { id: l.id } })).expiresAt.toISOString()).toBe(at.toISOString());
  });

  it("Json columns keep structure (nested arrays/objects, unicode)", async () => {
    const blocks = [{ type: "hero", title: "Éco-rénovation", items: [1, 2, { a: null, b: "😀" }] }];
    const p = await db.page.create({ data: page("json", { blocks }) });
    expect((await db.page.findUniqueOrThrow({ where: { id: p.id } })).blocks).toEqual(blocks);
    await db.setting.create({ data: { key: "k", value: { a: [true, false] } } });
    expect((await db.setting.findUniqueOrThrow({ where: { key: "k" } })).value).toEqual({ a: [true, false] });
  });

  it("transactions roll back completely on error", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.tag.create({ data: { slug: "t1", name: "T1" } });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.tag.count()).toBe(0);
  });

  it("onDelete cascade / set null behave as in the schema", async () => {
    const u = await db.user.create({ data: { email: "c@example.test", name: "C", passwordHash: "x" } });
    await db.session.create({ data: { tokenHash: "s".repeat(64), userId: u.id, expiresAt: new Date(Date.now() + 1e6) } });
    await db.auditLog.create({ data: { actorId: u.id, action: "x" } });
    await db.user.delete({ where: { id: u.id } });
    expect(await db.session.count()).toBe(0);
    expect((await db.auditLog.findFirstOrThrow()).actorId).toBeNull();
  });

  it("increment is atomic under concurrency (login failure counter pattern)", async () => {
    const u = await db.user.create({ data: { email: "i@example.test", name: "I", passwordHash: "x" } });
    await Promise.all(Array.from({ length: 30 }, () => db.user.update({ where: { id: u.id }, data: { failedLoginCount: { increment: 1 } } })));
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginCount).toBe(30);
  });
});
