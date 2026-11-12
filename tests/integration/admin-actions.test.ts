import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, db } from "../support/db";

const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
  }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieName } from "@/lib/auth/session";
import { getPublishedPageByPath, getPublishedPostBySlug, getPublishedProjectBySlug } from "@/lib/content/public";
import { getPrivateStorage } from "@/lib/storage";
import { createMediaFromBuffer } from "@/lib/media/service";
import * as content from "@/app/admin/(panel)/_actions/content";
import * as adminActions from "@/app/admin/(panel)/_actions/admin";
import * as leadActions from "@/app/admin/(panel)/_actions/leads";
import * as mediaActions from "@/app/admin/(panel)/_actions/media";
import { POST as uploadPOST } from "@/app/admin/(panel)/mediatheque/upload/route";
import { GET as listGET } from "@/app/admin/(panel)/mediatheque/liste/route";
import { GET as attachmentGET } from "@/app/admin/(panel)/demandes/[id]/pieces/[attachmentId]/route";
import { POST as exportPOST } from "@/app/admin/(panel)/demandes/export/route";

const PASSWORD = "correct horse battery staple";
const doc = (text = "Bonjour") => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const HOUR = 3600_000;

async function makeUser(role: "OWNER" | "EDITOR", email = `${role.toLowerCase()}@example.test`) {
  return db.user.create({ data: { email, name: role, role, passwordHash: await hashPassword(PASSWORD) } });
}
async function loginAs(role: "OWNER" | "EDITOR" | null) {
  cookieJar.clear();
  if (!role) return null;
  const u = await makeUser(role);
  const s = await createSession(u.id);
  cookieJar.set(sessionCookieName(), s.token);
  return u;
}
async function coverMedia(alt = "Maison rénovée") {
  const buffer = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#aa8866" } }).jpeg().toBuffer();
  return createMediaFromBuffer({ buffer, originalName: "c.jpg", alt, licenseType: "OWNED", isPlaceholder: false });
}
const postInput = (o: Record<string, unknown> = {}) => ({ title: "Titre", body: doc(), status: "DRAFT", ...o });
const pageInput = (o: Record<string, unknown> = {}) => ({ title: "Page", path: "page", template: "STANDARD", blocks: [], status: "DRAFT", ...o });

beforeEach(async () => {
  cookieJar.clear();
  await resetDb();
});

describe("authorization on every action", () => {
  const calls: [string, () => Promise<unknown>][] = [
    ["savePageAction", () => content.savePageAction(pageInput())],
    ["savePostAction", () => content.savePostAction(postInput())],
    ["saveProjectAction", () => content.saveProjectAction({ title: "P", blocks: [], status: "DRAFT" })],
    ["softDeleteAction", () => content.softDeleteAction("page", "x")],
    ["restoreAction", () => content.restoreAction("page", "x")],
    ["saveNavAction", () => content.saveNavAction({ location: "HEADER", items: [] })],
    ["saveRedirectAction", () => content.saveRedirectAction({ fromPath: "/a", toPath: "/b", statusCode: 301 })],
    ["updateMediaAction", () => mediaActions.updateMediaAction({})],
    ["setLeadStatusAction", () => leadActions.setLeadStatusAction({})],
    ["purgeExpiredLeadsAction", () => leadActions.purgeExpiredLeadsAction()],
    ["purgeAction", () => content.purgeAction("page", "x")],
    ["saveSettingsAction", () => adminActions.saveSettingsAction("mail", { enabled: true })],
    ["createUserAction", () => adminActions.createUserAction({})],
  ];

  it.each(calls)("%s rejects anonymous callers", async (_n, fn) => {
    await loginAs(null);
    await expect(fn()).rejects.toThrow("REDIRECT:/admin/login");
  });

  const ownerOnly: [string, () => Promise<unknown>][] = [
    ["purgeAction", () => content.purgeAction("page", "x")],
    ["deleteRedirectAction", () => content.deleteRedirectAction("x")],
    ["saveSettingsAction", () => adminActions.saveSettingsAction("company", {})],
    ["createUserAction", () => adminActions.createUserAction({ email: "a@b.fr", name: "Ab", role: "OWNER", password: PASSWORD })],
    ["updateUserAction", () => adminActions.updateUserAction({})],
    ["resetPasswordAction", () => adminActions.resetPasswordAction({})],
    ["anonymiseLeadAction", () => leadActions.anonymiseLeadAction("x")],
    ["deleteLeadAction", () => leadActions.deleteLeadAction("x")],
    ["purgeExpiredLeadsAction", () => leadActions.purgeExpiredLeadsAction()],
  ];

  it.each(ownerOnly)("%s refuses an EDITOR", async (_n, fn) => {
    await loginAs("EDITOR");
    await expect(fn()).rejects.toThrow("REDIRECT:/admin?refus=1");
    expect(await db.user.count()).toBe(1); // no user was created behind the refusal
  });

  it("an EDITOR can edit content but cannot create a 410 redirect", async () => {
    await loginAs("EDITOR");
    expect((await content.savePageAction(pageInput())).ok).toBe(true);
    const r = await content.saveRedirectAction({ fromPath: "/gone", statusCode: 410 });
    expect(r).toMatchObject({ ok: false });
    expect((await content.saveRedirectAction({ fromPath: "/old", toPath: "/new", statusCode: 301 })).ok).toBe(true);
  });

  it("a deactivated user's session is rejected", async () => {
    const u = await loginAs("EDITOR");
    await db.user.update({ where: { id: u!.id }, data: { active: false } });
    await expect(content.savePageAction(pageInput())).rejects.toThrow("REDIRECT:/admin/login");
  });
});

describe("route handlers", () => {
  const form = (extra: Record<string, string> = {}) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return f;
  };
  const req = (url: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    new Request(`http://localhost${url}`, { ...init, headers: { host: "localhost", ...(init.headers ?? {}) } });

  it("upload denies anonymous (401), cross-origin (403) and oversize announcements (413)", async () => {
    await loginAs(null);
    const body = form();
    expect((await uploadPOST(req("/admin/mediatheque/upload", { method: "POST", body, headers: { origin: "http://localhost", "content-length": "100" } }))).status).toBe(401);
    await loginAs("EDITOR");
    expect((await uploadPOST(req("/admin/mediatheque/upload", { method: "POST", body: form(), headers: { origin: "https://evil.example", "content-length": "100" } }))).status).toBe(403);
    expect((await uploadPOST(req("/admin/mediatheque/upload", { method: "POST", body: form(), headers: { "content-length": "100" } }))).status).toBe(403);
    expect((await uploadPOST(req("/admin/mediatheque/upload", { method: "POST", body: form(), headers: { origin: "http://localhost", "content-length": String(40 * 1024 * 1024) } }))).status).toBe(413);
  });

  it("upload accepts a real image, rejects SVG with 422", async () => {
    await loginAs("EDITOR");
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).png().toBuffer();
    const ok = form({ alt: "Un carré", licenseType: "OWNED" });
    ok.set("file", new File([new Uint8Array(png)], "carre.png", { type: "image/png" }));
    const res = await uploadPOST(req("/admin/mediatheque/upload", { method: "POST", body: ok, headers: { origin: "http://localhost", "content-length": String(png.length + 500) } }));
    expect(res.status).toBe(201);
    const bad = form();
    bad.set("file", new File(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], "x.svg", { type: "image/svg+xml" }));
    const res2 = await uploadPOST(req("/admin/mediatheque/upload", { method: "POST", body: bad, headers: { origin: "http://localhost", "content-length": "300" } }));
    expect(res2.status).toBe(422);
    expect(await db.media.count()).toBe(1);
  });

  it("media picker list requires a session", async () => {
    await loginAs(null);
    expect((await listGET(req("/admin/mediatheque/liste"))).status).toBe(401);
    await loginAs("EDITOR");
    expect((await listGET(req("/admin/mediatheque/liste"))).status).toBe(200);
  });

  async function leadWithFile() {
    const lead = await db.lead.create({
      data: { name: "Jean", email: "j@example.test", postalCode: "93600", projectType: "renovation", message: "Hello", consentAt: new Date(), consentTextVersion: "v", retentionUntil: new Date(Date.now() + 1e9) },
    });
    const key = "leads/2026/11/aaaaaaaaaaaaaaaaaaaaaaaa.pdf";
    await getPrivateStorage().put(key, Buffer.from("%PDF-1.4 secret"), "application/pdf");
    const att = await db.leadAttachment.create({ data: { leadId: lead.id, storageKey: key, originalName: "devis<1>.pdf", mime: "application/pdf", sizeBytes: 15, kind: "DOCUMENT" } });
    return { lead, att };
  }
  const attCtx = (leadId: string, attachmentId: string) => ({ params: Promise.resolve({ id: leadId, attachmentId }) });

  it("lead attachment route denies anonymous and serves editors as a forced download", async () => {
    const { lead, att } = await leadWithFile();
    await loginAs(null);
    const anon = await attachmentGET(req("/x"), attCtx(lead.id, att.id));
    expect(anon.status).toBe(401);
    expect(await anon.text()).not.toContain("secret");
    await loginAs("EDITOR");
    const ok = await attachmentGET(req("/x"), attCtx(lead.id, att.id));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ok.headers.get("cache-control")).toContain("no-store");
    expect(await ok.text()).toContain("secret");
    // wrong lead id / unknown attachment / traversal-looking ids
    expect((await attachmentGET(req("/x"), attCtx("other-lead", att.id))).status).toBe(404);
    expect((await attachmentGET(req("/x"), attCtx(lead.id, "../etc"))).status).toBe(404);
    await db.lead.update({ where: { id: lead.id }, data: { deletedAt: new Date() } });
    expect((await attachmentGET(req("/x"), attCtx(lead.id, att.id))).status).toBe(404);
  });

  it("CSV export: OWNER only, POST + same-origin, formula injection neutralised and audited", async () => {
    await db.lead.create({
      data: { name: "=HYPERLINK(\"http://evil\")", email: "e@example.test", phone: "+33123456789", postalCode: "93600", projectType: "renovation", message: "m", consentAt: new Date(), consentTextVersion: "v", retentionUntil: new Date(Date.now() + 1e9) },
    });
    const post = (headers: Record<string, string>) => exportPOST(req("/admin/demandes/export", { method: "POST", body: new FormData(), headers }));
    await loginAs(null);
    expect((await post({ origin: "http://localhost" })).status).toBe(401);
    await loginAs("EDITOR");
    expect((await post({ origin: "http://localhost" })).status).toBe(403);
    await loginAs("OWNER");
    expect((await post({})).status).toBe(403); // no Origin
    expect((await post({ origin: "https://evil.example" })).status).toBe(403);
    const res = await post({ origin: "http://localhost" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment;/);
    const csv = await res.text();
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).toContain("\"'+33123456789\"");
    expect(await db.auditLog.count({ where: { action: "lead.export" } })).toBe(1);
  });
});

describe("slugs", () => {
  it("strips accents, keeps slugs unique (also against the trash) and blocks reserved page paths", async () => {
    await loginAs("EDITOR");
    const a = await content.savePostAction(postInput({ title: "Rénovation énergétique : œuvre d’été" }));
    const b = await content.savePostAction(postInput({ title: "Rénovation énergétique : œuvre d’été" }));
    expect(a).toMatchObject({ ok: true, data: { slug: "renovation-energetique-oeuvre-d-ete" } });
    expect(b).toMatchObject({ ok: true, data: { slug: "renovation-energetique-oeuvre-d-ete-2" } });
    if (!a.ok) throw new Error();
    await content.softDeleteAction("post", a.data!.id);
    const c = await content.savePostAction(postInput({ title: "x", slug: "Rénovation Énergétique: œuvre d’été" }));
    expect(c).toMatchObject({ ok: false, fieldErrors: { slug: expect.any(String) } }); // trashed slug stays reserved

    const p1 = await content.savePageAction(pageInput({ title: "Rénovation", path: "Services/Rénovation Énergétique/", template: "SERVICE" }));
    expect(p1).toMatchObject({ ok: true, data: { path: "services/renovation-energetique" } });
    const p2 = await content.savePageAction(pageInput({ title: "Autre", path: "services/renovation-energetique", template: "SERVICE" }));
    expect(p2).toMatchObject({ ok: false, fieldErrors: { path: expect.any(String) } });
    for (const bad of ["admin", "blog/mon-article", "api/x", "realisations", "media/x"]) {
      const r = await content.savePageAction(pageInput({ path: bad }));
      expect(r.ok, bad).toBe(false);
    }
    const auto = await content.savePageAction(pageInput({ title: "À propos de nous", path: "" }));
    expect(auto).toMatchObject({ ok: true, data: { path: "a-propos-de-nous" } });
  });

  it("only the HOME template may use the empty path", async () => {
    await loginAs("EDITOR");
    const home = await content.savePageAction(pageInput({ title: "Accueil", path: "ignored", template: "HOME" }));
    expect(home).toMatchObject({ ok: true, data: { path: "" } });
    const second = await content.savePageAction(pageInput({ title: "Accueil 2", path: "", template: "HOME" }));
    expect(second.ok).toBe(false);
    if (home.ok) expect((await content.softDeleteAction("page", home.data!.id)).ok).toBe(false); // home is protected
  });
});

describe("301 redirects on address change", () => {
  it("creates a 301 for a published slug change, collapses chains and never loops", async () => {
    await loginAs("EDITOR");
    const cover = await coverMedia();
    const created = await content.savePostAction(postInput({ title: "Alpha", status: "PUBLISHED", coverImageId: cover.id }));
    if (!created.ok) throw new Error(JSON.stringify(created));
    const id = created.data!.id;
    const rename = (slug: string, status = "PUBLISHED") => content.savePostAction(postInput({ id, title: "Alpha", slug, status, coverImageId: cover.id }));

    expect((await rename("beta")).ok).toBe(true);
    expect(await db.redirect.findUnique({ where: { fromPath: "/blog/alpha" } })).toMatchObject({ toPath: "/blog/beta", statusCode: 301 });

    expect((await rename("gamma")).ok).toBe(true);
    expect(await db.redirect.findUnique({ where: { fromPath: "/blog/alpha" } })).toMatchObject({ toPath: "/blog/gamma" }); // collapsed
    expect(await db.redirect.findUnique({ where: { fromPath: "/blog/beta" } })).toMatchObject({ toPath: "/blog/gamma" });

    // going back to an old address removes the redirect that would shadow it: no A->B->A loop
    expect((await rename("alpha")).ok).toBe(true);
    expect(await db.redirect.findUnique({ where: { fromPath: "/blog/alpha" } })).toBeNull();
    for (const r of await db.redirect.findMany()) {
      expect(r.toPath).not.toBe(r.fromPath);
      const seen = new Set([r.fromPath]);
      let cur = r.toPath;
      while (cur) {
        expect(seen.has(cur), `loop at ${cur}`).toBe(false);
        seen.add(cur);
        cur = (await db.redirect.findUnique({ where: { fromPath: cur } }))?.toPath ?? null;
      }
    }
    expect(await db.redirect.findUnique({ where: { fromPath: "/blog/gamma" } })).toMatchObject({ toPath: "/blog/alpha" });
  });

  it("does not redirect a draft that was never public, and handles page paths", async () => {
    await loginAs("EDITOR");
    const d = await content.savePageAction(pageInput({ path: "brouillon" }));
    if (!d.ok) throw new Error();
    await content.savePageAction(pageInput({ id: d.data!.id, path: "brouillon-2" }));
    expect(await db.redirect.count()).toBe(0);

    const p = await content.savePageAction(pageInput({ path: "services/avant", status: "PUBLISHED", template: "SERVICE" }));
    if (!p.ok) throw new Error();
    await content.savePageAction(pageInput({ id: p.data!.id, path: "services/apres", status: "PUBLISHED", template: "SERVICE" }));
    expect(await db.redirect.findUnique({ where: { fromPath: "/services/avant" } })).toMatchObject({ toPath: "/services/apres", statusCode: 301 });
  });

  it("manual redirects refuse loops, reserved sources and external-looking junk", async () => {
    await loginAs("OWNER");
    expect((await content.saveRedirectAction({ fromPath: "/a", toPath: "/b", statusCode: 301 })).ok).toBe(true);
    expect((await content.saveRedirectAction({ fromPath: "/b", toPath: "/a", statusCode: 301 })).ok).toBe(false);
    expect((await content.saveRedirectAction({ fromPath: "/c", toPath: "/c", statusCode: 301 })).ok).toBe(false);
    expect((await content.saveRedirectAction({ fromPath: "/admin/x", toPath: "/a", statusCode: 301 })).ok).toBe(false);
    expect((await content.saveRedirectAction({ fromPath: "/d", toPath: "javascript:alert(1)", statusCode: 301 })).ok).toBe(false);
    expect((await content.saveRedirectAction({ fromPath: "/e", toPath: "//evil.example", statusCode: 301 })).ok).toBe(false);
    expect((await content.saveRedirectAction({ fromPath: "/gone", statusCode: 410 })).ok).toBe(true);
  });
});

describe("rich text server validation", () => {
  it("saves a valid document and rejects javascript: links, unknown nodes, style attributes", async () => {
    await loginAs("EDITOR");
    const link = (href: string) => ({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "clic", marks: [{ type: "link", attrs: { href, target: "_blank", rel: "noopener", class: null } }] }] }],
    });
    const ok = await content.savePostAction(postInput({ title: "OK", body: link("https://example.com/page") }));
    expect(ok.ok).toBe(true);
    for (const href of ["javascript:alert(1)", "data:text/html,<script>1</script>", "  JaVaScRiPt:alert(1)"]) {
      const r = await content.savePostAction(postInput({ title: "Bad", body: link(href) }));
      expect(r.ok, href).toBe(false);
    }
    const unknown = await content.savePostAction(postInput({ title: "Bad", body: { type: "doc", content: [{ type: "html", attrs: { value: "<script>1</script>" } }] } }));
    expect(unknown).toMatchObject({ ok: false, fieldErrors: { body: expect.stringContaining("html") } });
    const style = await content.savePostAction(
      postInput({ title: "Bad", body: { type: "doc", content: [{ type: "paragraph", attrs: { style: "position:fixed" }, content: [{ type: "text", text: "x" }] }] } }),
    );
    expect(style.ok).toBe(false);
    const img = await content.savePostAction(
      postInput({ title: "Bad", body: { type: "doc", content: [{ type: "image", attrs: { mediaId: "m1", alt: "", src: "javascript:alert(1)" } }] } }),
    );
    expect(img.ok).toBe(false);
    expect(await db.post.count()).toBe(1);
    expect((await db.post.findFirstOrThrow()).body).toMatchObject({ type: "doc" });
  });

  it("page blocks: richText block is validated and malformed blocks are refused with a per-block message", async () => {
    await loginAs("EDITOR");
    const bad = await content.savePageAction(
      pageInput({ blocks: [{ type: "hero", heading: "ok" }, { type: "ctaBand", heading: "x", label: "y", href: "javascript:alert(1)" }, { type: "script", src: "x" }] }),
    );
    expect(bad).toMatchObject({ ok: false, fieldErrors: { "block:1": expect.any(String), "block:2": expect.any(String) } });
    const evilRt = await content.savePageAction(pageInput({ blocks: [{ type: "richText", doc: { type: "doc", content: [{ type: "iframe" }] } }] }));
    expect(evilRt.ok).toBe(false);
    expect((await content.savePageAction(pageInput({ blocks: [{ type: "hero", heading: "Bonjour" }] }))).ok).toBe(true);
  });
});

describe("publication workflow", () => {
  it("requires a cover image with alt text to publish a post; saves drafts without", async () => {
    await loginAs("EDITOR");
    expect((await content.savePostAction(postInput({ status: "PUBLISHED" }))).ok).toBe(false);
    const noAlt = await coverMedia("");
    const r = await content.savePostAction(postInput({ status: "PUBLISHED", coverImageId: noAlt.id }));
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("alternatif") });
    expect((await content.savePostAction(postInput({ status: "DRAFT", coverImageId: noAlt.id }))).ok).toBe(true);
    const withAlt = await coverMedia();
    expect((await content.savePostAction(postInput({ title: "Pub", status: "PUBLISHED", coverImageId: withAlt.id }))).ok).toBe(true);
    // media ids are never trusted
    expect((await content.savePostAction(postInput({ title: "Ghost", coverImageId: "nope" }))).ok).toBe(false);
  });

  it("scheduled content is invisible until due; past dates are refused; Europe/Paris is honoured", async () => {
    await loginAs("EDITOR");
    const cover = await coverMedia();
    const future = new Date(Date.now() + 48 * HOUR);
    const local = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" }).format(d).replace(" ", "T");
    const r = await content.savePostAction(postInput({ title: "Futur", status: "SCHEDULED", scheduledAt: local(future), coverImageId: cover.id }));
    if (!r.ok) throw new Error(JSON.stringify(r));
    const row = await db.post.findUniqueOrThrow({ where: { id: r.data!.id } });
    expect(row.status).toBe("SCHEDULED");
    expect(Math.abs(row.scheduledAt!.getTime() - future.getTime())).toBeLessThan(61_000);
    expect(await getPublishedPostBySlug(row.slug)).toBeNull();
    // becomes public by itself once the date has passed (no cron)
    await db.post.update({ where: { id: row.id }, data: { scheduledAt: new Date(Date.now() - HOUR) } });
    expect((await getPublishedPostBySlug(row.slug))?.title).toBe("Futur");

    const past = local(new Date(Date.now() - 48 * HOUR));
    expect(await content.savePostAction(postInput({ title: "Passé", status: "SCHEDULED", scheduledAt: past, coverImageId: cover.id }))).toMatchObject({ ok: false });
    expect(await content.savePostAction(postInput({ title: "Sans date", status: "SCHEDULED", coverImageId: cover.id }))).toMatchObject({ ok: false });

    const page = await content.savePageAction(pageInput({ path: "bientot", status: "SCHEDULED", scheduledAt: local(future) }));
    expect(page.ok).toBe(true);
    expect(await getPublishedPageByPath("bientot")).toBeNull();
  });

  it("unpublish returns to draft and removes the page from the public site", async () => {
    await loginAs("EDITOR");
    const p = await content.savePageAction(pageInput({ path: "visible", status: "PUBLISHED" }));
    if (!p.ok) throw new Error();
    expect(await getPublishedPageByPath("visible")).not.toBeNull();
    expect((await content.unpublishAction("page", p.data!.id)).ok).toBe(true);
    expect(await getPublishedPageByPath("visible")).toBeNull();
    expect((await db.page.findUniqueOrThrow({ where: { id: p.data!.id } })).publishedAt).not.toBeNull(); // first publication date is kept
  });
});

describe("revisions", () => {
  it("records a revision per save and restores content without touching status or address", async () => {
    await loginAs("EDITOR");
    const r1 = await content.savePageAction(pageInput({ title: "V1", path: "rev", blocks: [{ type: "hero", heading: "Première" }] }));
    if (!r1.ok) throw new Error();
    const id = r1.data!.id;
    await content.savePageAction(pageInput({ id, title: "V2", path: "rev", blocks: [{ type: "hero", heading: "Seconde" }], status: "PUBLISHED" }));
    const revs = await db.pageRevision.findMany({ where: { pageId: id }, orderBy: { createdAt: "asc" } });
    expect(revs).toHaveLength(2);
    expect((await content.restorePageRevisionAction(id, revs[0]!.id)).ok).toBe(true);
    const page = await db.page.findUniqueOrThrow({ where: { id } });
    expect(page.title).toBe("V1");
    expect(page.status).toBe("PUBLISHED");
    expect(page.path).toBe("rev");
    expect(await db.pageRevision.count({ where: { pageId: id } })).toBe(3);
    expect((await content.restorePageRevisionAction(id, "other")).ok).toBe(false);
  });
});

describe("soft delete and restore", () => {
  it("hides content from public queries; restore brings it back; purge is OWNER-only and needs the trash", async () => {
    await loginAs("EDITOR");
    const cover = await coverMedia();
    const post = await content.savePostAction(postInput({ title: "Supprimable", status: "PUBLISHED", coverImageId: cover.id }));
    const page = await content.savePageAction(pageInput({ path: "supprimable", status: "PUBLISHED" }));
    const proj = await content.saveProjectAction({ title: "Chantier", blocks: [], status: "PUBLISHED" });
    if (!post.ok || !page.ok || !proj.ok) throw new Error();
    expect(await getPublishedPostBySlug(post.data!.slug)).not.toBeNull();

    for (const [kind, id] of [["post", post.data!.id], ["page", page.data!.id], ["project", proj.data!.id]] as const) {
      expect((await content.softDeleteAction(kind, id)).ok).toBe(true);
    }
    expect(await getPublishedPostBySlug(post.data!.slug)).toBeNull();
    expect(await getPublishedPageByPath("supprimable")).toBeNull();
    expect(await getPublishedProjectBySlug(proj.data!.slug)).toBeNull();
    // a trashed item cannot be edited
    expect((await content.savePostAction(postInput({ id: post.data!.id, title: "Edit" }))).ok).toBe(false);

    expect((await content.restoreAction("post", post.data!.id)).ok).toBe(true);
    expect(await getPublishedPostBySlug(post.data!.slug)).not.toBeNull();

    await loginAs("OWNER");
    expect((await content.purgeAction("post", post.data!.id)).ok).toBe(false); // not in trash
    expect((await content.purgeAction("page", page.data!.id)).ok).toBe(true);
    expect(await db.page.count()).toBe(0);
  });

  it("every mutation writes an audit entry without PII", async () => {
    const u = await loginAs("EDITOR");
    await content.savePageAction(pageInput({ path: "audit" }));
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "page.create" } });
    expect(log.actorId).toBe(u!.id);
    expect(JSON.stringify(log.summary)).not.toContain("example.test");
  });
});

describe("project media", () => {
  it("stores gallery order and before/after pairs; refuses placeholder-free publish without alt", async () => {
    await loginAs("EDITOR");
    const [a, b, c] = [await coverMedia(), await coverMedia(), await coverMedia()];
    const r = await content.saveProjectAction({
      title: "Extension bois",
      blocks: [],
      status: "PUBLISHED",
      region: "MANCHE",
      isPlaceholder: true,
      gallery: [b.id, a.id],
      pairs: [{ beforeId: c.id, afterId: a.id }],
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const p = await getPublishedProjectBySlug(r.data!.slug);
    expect(p?.isPlaceholder).toBe(true);
    const rows = await db.projectMedia.findMany({ where: { projectId: r.data!.id }, orderBy: [{ sortOrder: "asc" }] });
    expect(rows.map((x) => `${x.role}:${x.sortOrder}`)).toEqual(["GALLERY:0", "GALLERY:1", "BEFORE:100", "AFTER:100"]);
  });
});

describe("users: last OWNER protection", () => {
  it("cannot demote or deactivate the last active OWNER; can once another OWNER exists", async () => {
    const a = (await loginAs("OWNER"))!;
    expect(await adminActions.updateUserAction({ id: a.id, name: "Alice", role: "EDITOR", active: true })).toMatchObject({ ok: false, error: expect.stringContaining("au moins un propriétaire") });
    expect(await adminActions.updateUserAction({ id: a.id, name: "Alice", role: "OWNER", active: false })).toMatchObject({ ok: false, error: expect.stringContaining("propre compte") });
    expect((await db.user.findUniqueOrThrow({ where: { id: a.id } })).role).toBe("OWNER");

    const made = await adminActions.createUserAction({ email: "Second@Example.test ", name: "Second", role: "OWNER", password: PASSWORD });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect((await db.user.findUniqueOrThrow({ where: { id: made.data!.id } })).email).toBe("second@example.test");
    // now A may demote itself ...
    const res = await adminActions.updateUserAction({ id: a.id, name: "Alice", role: "EDITOR", active: true });
    expect(res, JSON.stringify(res)).toMatchObject({ ok: true });
  });

  it("the remaining OWNER cannot be demoted by itself; weak and duplicate accounts are refused", async () => {
    const a = (await loginAs("OWNER"))!;
    const b = await makeUser("EDITOR", "ed@example.test");
    expect((await adminActions.updateUserAction({ id: b.id, name: "Ed", role: "OWNER", active: true })).ok).toBe(true);
    expect((await adminActions.updateUserAction({ id: b.id, name: "Ed", role: "EDITOR", active: true })).ok).toBe(true);
    expect(await adminActions.updateUserAction({ id: a.id, name: "Alice", role: "EDITOR", active: true })).toMatchObject({ ok: false, error: expect.stringContaining("au moins un propriétaire") });
    expect(await adminActions.updateUserAction({ id: a.id, name: "Alice", role: "OWNER", active: false })).toMatchObject({ ok: false });
    expect(await adminActions.createUserAction({ email: "x@example.test", name: "Xx", role: "EDITOR", password: "short" })).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
    expect(await adminActions.createUserAction({ email: "ED@example.test", name: "Xx", role: "EDITOR", password: PASSWORD })).toMatchObject({ ok: false });
  });

  it("password reset enforces the policy and closes the user's sessions; deactivation does too", async () => {
    await loginAs("OWNER");
    const e = await makeUser("EDITOR", "ed2@example.test");
    await createSession(e.id);
    expect((await adminActions.resetPasswordAction({ id: e.id, password: "tooshort" })).ok).toBe(false);
    expect((await adminActions.resetPasswordAction({ id: e.id, password: "a-very-long-new-password" })).ok).toBe(true);
    expect(await db.session.count({ where: { userId: e.id } })).toBe(0);
    await createSession(e.id);
    await adminActions.updateUserAction({ id: e.id, name: "Ed", role: "EDITOR", active: false });
    expect(await db.session.count({ where: { userId: e.id } })).toBe(0);
  });
});

describe("leads and settings", () => {
  const mkLead = () =>
    db.lead.create({
      data: { name: "Marie Curie", email: "m@example.test", phone: "0102030405", postalCode: "93600", city: "Aulnay", projectType: "extension", message: "Bonjour", internalNotes: "note", consentAt: new Date(), consentTextVersion: "v", retentionUntil: new Date(Date.now() + 1e10) },
    });

  it("an editor can change status/notes; resend reports mail-disabled state", async () => {
    await loginAs("EDITOR");
    const lead = await mkLead();
    expect((await leadActions.setLeadStatusAction({ id: lead.id, status: "CONTACTED" })).ok).toBe(true);
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("CONTACTED");
    expect((await leadActions.setLeadStatusAction({ id: lead.id, status: "HACKED" })).ok).toBe(false);
    expect((await leadActions.saveLeadNotesAction({ id: lead.id, notes: "Rappeler lundi" })).ok).toBe(true);
    const r = await leadActions.resendLeadAction(lead.id);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("pas configuré") });
    expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).mailDeliveryState).toBe("NOT_CONFIGURED");
    const audit = await db.auditLog.findMany({ where: { entityId: lead.id } });
    expect(JSON.stringify(audit)).not.toContain("Rappeler lundi");
  });

  it("OWNER anonymises (keeps statistics) and permanently deletes (files too)", async () => {
    await loginAs("OWNER");
    const lead = await mkLead();
    const key = "leads/2026/11/bbbbbbbbbbbbbbbbbbbbbbbb.pdf";
    await getPrivateStorage().put(key, Buffer.from("%PDF-1.4"), "application/pdf");
    await db.leadAttachment.create({ data: { leadId: lead.id, storageKey: key, originalName: "a.pdf", mime: "application/pdf", sizeBytes: 8, kind: "DOCUMENT" } });
    expect((await leadActions.anonymiseLeadAction(lead.id)).ok).toBe(true);
    const row = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(row).toMatchObject({ name: "Anonymisé", phone: null, city: null, internalNotes: null, projectType: "extension" });
    expect(row.email).not.toContain("example.test");
    expect(await getPrivateStorage().exists(key)).toBe(false);
    expect((await leadActions.deleteLeadAction(lead.id)).ok).toBe(true);
    expect(await db.lead.count()).toBe(0);
  });

  it("purgeExpiredLeadsAction: EDITOR cannot purge; OWNER purges only expired leads, reports the count and audits", async () => {
    const mk = (email: string, retentionUntil: Date) =>
      db.lead.create({ data: { name: "N", email, projectType: "extension", message: "Bonjour, projet.", postalCode: "93600", consentAt: new Date(), consentTextVersion: "t", retentionUntil } as never });
    const expired = await mk("old@example.test", new Date(Date.now() - HOUR));
    const fresh = await mk("new@example.test", new Date(Date.now() + 30 * 24 * HOUR));
    await loginAs("EDITOR");
    await expect(leadActions.purgeExpiredLeadsAction()).rejects.toThrow("REDIRECT:/admin?refus=1");
    expect(await db.lead.count()).toBe(2);
    await loginAs("OWNER");
    const r = await leadActions.purgeExpiredLeadsAction();
    expect(r.ok).toBe(true);
    expect(r.ok && r.data?.leads).toBe(1);
    expect(r.ok && r.message).toContain("1 demande");
    expect(await db.lead.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await db.lead.findUnique({ where: { id: fresh.id } })).not.toBeNull();
    expect(await db.auditLog.count({ where: { action: "maintenance.purge" } })).toBe(1);
  });

  it("settings: OWNER saves validated groups; invalid values and unknown keys are refused", async () => {
    await loginAs("OWNER");
    expect((await adminActions.saveSettingsAction("mail", { enabled: true })).ok).toBe(true);
    expect((await adminActions.saveSettingsAction("social", { linkedin: "javascript:alert(1)" })).ok).toBe(false);
    expect((await adminActions.saveSettingsAction("nope", {})).ok).toBe(false);
    expect((await adminActions.saveSettingsAction("analytics", { provider: "ga4", id: "", enabled: true })).ok).toBe(false);
    expect((await adminActions.saveSettingsAction("seo", { googleSiteVerification: "abc<script>" })).ok).toBe(false);
    expect(await db.auditLog.count({ where: { action: "settings.update" } })).toBe(1);
  });
});

describe("branding (logo override)", () => {
  it("OWNER can set and reset logos; unknown, trashed or malformed media ids are refused; EDITOR is refused", async () => {
    await loginAs("OWNER");
    const logo = await coverMedia("Logo BatiNova");
    expect((await adminActions.saveSettingsAction("branding", { logoMediaId: logo.id, logoMonoMediaId: null, logoOnDarkMediaId: null })).ok).toBe(true);
    expect((await db.setting.findUniqueOrThrow({ where: { key: "branding" } })).value).toMatchObject({ logoMediaId: logo.id });
    expect((await adminActions.saveSettingsAction("branding", { logoMediaId: "ghost-id", logoMonoMediaId: null, logoOnDarkMediaId: null })).ok).toBe(false);
    expect((await adminActions.saveSettingsAction("branding", { logoMediaId: "../../etc", logoMonoMediaId: null, logoOnDarkMediaId: null })).ok).toBe(false);
    await db.media.update({ where: { id: logo.id }, data: { deletedAt: new Date() } });
    expect((await adminActions.saveSettingsAction("branding", { logoMediaId: null, logoMonoMediaId: logo.id, logoOnDarkMediaId: null })).ok).toBe(false);
    expect((await adminActions.saveSettingsAction("branding", { logoMediaId: null, logoMonoMediaId: null, logoOnDarkMediaId: null })).ok).toBe(true); // "Revenir au logo officiel"
    await loginAs("EDITOR");
    await expect(adminActions.saveSettingsAction("branding", {})).rejects.toThrow("REDIRECT:/admin?refus=1");
  });
});

describe("navigation", () => {
  it("never trusts item ids from other locations and rejects unsafe hrefs", async () => {
    await loginAs("EDITOR");
    const page = await db.page.create({ data: { path: "contact", title: "Contact", blocks: [], status: "PUBLISHED" } });
    const foreign = await db.navItem.create({ data: { location: "FOOTER_LEGAL", label: "Mentions", href: "/mentions-legales" } });
    const bad = await content.saveNavAction({ location: "HEADER", items: [{ label: "Evil", href: "javascript:alert(1)" }] });
    expect(bad).toMatchObject({ ok: false });
    const r = await content.saveNavAction({
      location: "HEADER",
      items: [{ id: foreign.id, label: "Hijack", pageId: page.id, children: [{ label: "Devis", href: "/contact#devis" }] }],
    });
    expect(r.ok).toBe(true);
    expect((await db.navItem.findUniqueOrThrow({ where: { id: foreign.id } })).label).toBe("Mentions"); // untouched
    expect(await db.navItem.count({ where: { location: "HEADER" } })).toBe(2);
    expect((await content.saveNavAction({ location: "FOOTER_PRIMARY", items: [{ label: "x", href: "/a", children: [{ label: "y", href: "/b" }] }] })).ok).toBe(false);
  });
});
