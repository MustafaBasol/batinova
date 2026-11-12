import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { creds, fakeIp, login, makeJpeg, newClientContext } from "./helpers";

const TITLE = "Article E2E Cycle";
const SLUG = "article-e2e-cycle";
const SLUG2 = "article-e2e-renomme";
const ORIGIN = "http://localhost:3500"; // browser/request origin of the E2E server
const SITE = "https://btnv.fr"; // production SITE_URL the server runs with (canonical, sitemap)

test.describe("admin access control", () => {
  test("anonymous visitors cannot reach admin pages or handlers", async ({ browser }) => {
    const ctx = await newClientContext(browser);
    for (const p of ["/admin", "/admin/articles", "/admin/demandes", "/admin/utilisateurs", "/admin/reglages", "/admin/mediatheque/liste"]) {
      const res = await ctx.request.get(p, { maxRedirects: 0 });
      expect([301, 302, 303, 307, 308], `${p} -> ${res.status()}`).toContain(res.status());
      expect(res.headers()["location"] ?? "").toContain("/admin/login");
    }
    const up = await ctx.request.post("/admin/mediatheque/upload", {
      maxRedirects: 0,
      headers: { origin: ORIGIN },
      multipart: { file: { name: "a.jpg", mimeType: "image/jpeg", buffer: await makeJpeg(64, 64) } },
    });
    expect([301, 302, 303, 307, 308, 401, 403]).toContain(up.status());
    const exp = await ctx.request.post("/admin/demandes/export", { maxRedirects: 0, headers: { origin: ORIGIN } });
    expect([301, 302, 303, 307, 308, 401, 403]).toContain(exp.status());
    await ctx.close();
  });

  test("open redirect via login `next` is neutralised", async ({ browser }) => {
    const ctx = await newClientContext(browser);
    const page = await ctx.newPage();
    for (const evil of ["//evil.example", "https://evil.example", "/\\evil.example", "/admin/../evil", "javascript:alert(1)"]) {
      await page.goto(`/admin/login?next=${encodeURIComponent(evil)}`);
      await page.getByLabel("Adresse e-mail").fill(creds.editor.email);
      await page.getByLabel("Mot de passe").fill(creds.editor.password);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"));
      expect(new URL(page.url()).origin, `next=${evil}`).toBe(ORIGIN);
      expect(new URL(page.url()).pathname.startsWith("/admin")).toBe(true);
      await page.context().clearCookies();
    }
    await ctx.close();
  });

  test("session cookie flags: HttpOnly, SameSite=Lax, Secure + __Host- prefix", async ({ browser }) => {
    const ctx = await newClientContext(browser);
    const page = await ctx.newPage();
    await login(page, "editor");
    const c = (await ctx.cookies()).find((k) => k.name.includes("btnv_session"));
    expect(c, "session cookie").toBeTruthy();
    expect(c!.name).toBe("__Host-btnv_session");
    expect(c!.httpOnly).toBe(true);
    expect(c!.secure).toBe(true);
    expect(c!.sameSite).toBe("Lax");
    expect(c!.path).toBe("/");
    expect(c!.value).not.toContain(creds.editor.email);
    await ctx.close();
  });

  test("EDITOR is denied /admin/utilisateurs and /admin/reglages server-side; OWNER is allowed", async ({ browser }) => {
    const ed = await newClientContext(browser);
    const ep = await ed.newPage();
    await login(ep, "editor");
    for (const p of ["/admin/utilisateurs", "/admin/reglages"]) {
      await ep.goto(p);
      await expect(ep).toHaveURL(/\/admin\?refus=1/);
      await expect(ep.getByText("Accès refusé")).toBeVisible();
    }
    // handler-level denial (OWNER-only CSV export)
    const res = await ed.request.post("/admin/demandes/export", { headers: { origin: ORIGIN }, maxRedirects: 0 });
    expect(res.status()).toBe(403);
    await ed.close();

    const ow = await newClientContext(browser);
    const op = await ow.newPage();
    await login(op, "owner");
    await op.goto("/admin/utilisateurs");
    await expect(op).toHaveURL(/\/admin\/utilisateurs$/);
    await op.goto("/admin/reglages");
    await expect(op).toHaveURL(/\/admin\/reglages$/);
    await ow.close();
  });

  test("login throttling: lockout then 'Trop de tentatives' (dedicated account)", async ({ browser }) => {
    const ctx = await newClientContext(browser);
    const page = await ctx.newPage();
    const attempt = async (pw: string) => {
      await page.goto("/admin/login");
      await page.getByLabel("Adresse e-mail").fill(creds.lockout.email);
      await page.getByLabel("Mot de passe").fill(pw);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await expect(page.locator("#login-error")).toBeVisible();
      return (await page.locator("#login-error").innerText()).trim();
    };
    for (let i = 0; i < 5; i++) expect(await attempt(`wrong-${i}-password`)).toContain("Identifiants invalides");
    // account now locked: even the right password is refused with the same generic message
    expect(await attempt(creds.lockout.password)).toContain("Identifiants invalides");
    expect(page.url()).toContain("/admin/login");
    let msg = "";
    for (let i = 0; i < 6 && !msg.includes("Trop de tentatives"); i++) msg = await attempt(`wrong-more-${i}`);
    expect(msg).toContain("Trop de tentatives");
    await ctx.close();
  });
});

test.describe.serial("post lifecycle (Tiptap, preview, publish, sitemap, slug 301, trash)", () => {
  let ctx: BrowserContext;
  let anon: BrowserContext;
  let page: Page;
  let postUrl = "";

  test.beforeAll(async ({ browser }) => {
    ctx = await newClientContext(browser);
    anon = await newClientContext(browser);
    page = await ctx.newPage();
    await login(page, "editor");
  });
  test.afterAll(async () => {
    await ctx?.close();
    await anon?.close();
  });

  const publicStatus = async (path: string) => (await anon.request.get(path, { maxRedirects: 0 })).status();
  const sitemap = async () => (await anon.request.get("/sitemap.xml")).text();

  async function save() {
    await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await page.waitForTimeout(1500);
    const alerts = (await page.locator('form [role="alert"], [role="status"]').allInnerTexts()).filter(Boolean);
    await expect(page.getByText("Modifications non enregistrées"), `save did not complete; alerts: ${alerts.join(" | ")}`).toBeHidden({ timeout: 15_000 });
  }

  test("create a draft with the Tiptap editor (type, bold, H2, link) and a cover image", async () => {
    await page.goto("/admin/articles/nouveau");
    await page.getByLabel("Titre de l’article (H1)").fill(TITLE);
    await expect(page.getByRole("textbox", { name: "Adresse (slug)" })).toHaveValue(SLUG);
    await page.getByLabel("Résumé (chapô)").fill("Résumé de l’article de test automatisé.");

    const editor = page.getByRole("textbox", { name: "Contenu de l’article" });
    await expect(page.getByRole("toolbar", { name: "Mise en forme du texte" })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await editor.click();
    await page.keyboard.type("Texte important du paragraphe");
    await expect(editor).toContainText("Texte important du paragraphe");
    await page.keyboard.press("Shift+Home");
    await page.getByRole("button", { name: "Gras", exact: true }).click();
    await expect(editor.locator("strong")).toContainText("Texte important");
    await page.keyboard.press("ArrowRight"); // collapse the selection at the end of the bold text
    await page.waitForTimeout(250); // let ProseMirror process the DOM selection change (keyboard events are instantaneous here)
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Titre de section (H2)" }).click();
    await page.keyboard.type("Un intertitre de test");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Lien vers la page contact");
    await page.keyboard.press("Shift+Home");
    await page.getByRole("button", { name: "Lien (ajouter ou modifier)" }).click();
    await page.getByLabel("Adresse du lien").fill("/contact");
    await page.getByRole("button", { name: "Appliquer" }).click();
    await expect(editor.locator("strong")).toContainText("Texte important");
    await expect(editor.locator("h2")).toContainText("Un intertitre de test");
    await expect(editor.locator('a[href="/contact"]')).toHaveCount(1);

    // cover image (required to publish): first seeded stock image from the library
    await page.getByRole("button", { name: "Choisir" }).first().click();
    const dlg = page.getByRole("dialog", { name: "Choisir une image" });
    await dlg.locator("ul button").first().click();
    await expect(page.getByText(/Alt :/).first()).toBeVisible();

    await save();
    await page.waitForURL(/\/admin\/articles\/(?!nouveau)[^/]+$/);
    postUrl = `/blog/${SLUG}`;
  });

  test("draft is not public (404, not in blog index/sitemap); admin preview works; anonymous preview is denied", async () => {
    expect(await publicStatus(postUrl)).toBe(404);
    expect(await (await anon.request.get("/blog")).text()).not.toContain(TITLE);
    expect(await sitemap()).not.toContain(SLUG);

    const href = await page.getByRole("link", { name: "Aperçu (privé)" }).getAttribute("href");
    expect(href).toMatch(/^\/admin\/apercu\/article\//);
    const pv = await ctx.request.get(href!);
    expect(pv.status()).toBe(200);
    expect(await pv.text()).toContain(TITLE);
    expect(pv.headers()["x-robots-tag"] ?? "").toContain("noindex");

    const anonPv = await anon.request.get(href!, { maxRedirects: 0 });
    expect([301, 302, 303, 307, 308, 401, 403, 404]).toContain(anonPv.status());
    expect(await anonPv.text()).not.toContain(TITLE);
  });

  test("publish: public page renders rich text, appears in /blog and sitemap with canonical + JSON-LD", async () => {
    await page.getByRole("combobox", { name: /^État/ }).selectOption({ label: "Publié" });
    await save();
    expect(await publicStatus(postUrl)).toBe(200);
    const html = await (await anon.request.get(postUrl)).text();
    expect(html).toContain(TITLE);
    expect(html).toMatch(/<strong[^>]*>Texte important/);
    expect(html).toMatch(/<h2[^>]*>Un intertitre de test/);
    expect(html).toMatch(/<a[^>]*href="\/contact"/);
    expect(html).toContain(`<link rel="canonical" href="${SITE}${postUrl}"`);
    expect(html).toContain('"@type":"BlogPosting"');
    expect(await (await anon.request.get("/blog")).text()).toContain(TITLE);
    expect(await sitemap()).toContain(`${SITE}${postUrl}`);
  });

  test("unpublish: 404 and removed from sitemap", async () => {
    await page.getByRole("button", { name: "Dépublier" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Dépublier" }).click();
    await expect.poll(() => publicStatus(postUrl)).toBe(404);
    expect(await sitemap()).not.toContain(SLUG);
    expect(await (await anon.request.get("/blog")).text()).not.toContain(TITLE);
  });

  test("republish then change slug: old URL answers 301 to the new URL", async () => {
    await page.reload();
    await page.getByRole("combobox", { name: /^État/ }).selectOption({ label: "Publié" });
    await save();
    expect(await publicStatus(postUrl)).toBe(200);
    await page.getByRole("textbox", { name: "Adresse (slug)" }).fill(SLUG2);
    await save();
    const res = await anon.request.get(postUrl, { maxRedirects: 0 });
    expect(res.status()).toBe(301);
    expect(res.headers()["location"]).toContain(`/blog/${SLUG2}`);
    expect(await publicStatus(`/blog/${SLUG2}`)).toBe(200);
    const sm = await sitemap();
    expect(sm).toContain(`/blog/${SLUG2}`);
    expect(sm).not.toContain(`/blog/${SLUG}<`);
  });

  test("trash and restore", async () => {
    postUrl = `/blog/${SLUG2}`;
    await page.getByRole("button", { name: "Supprimer" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Mettre à la corbeille" }).click();
    await page.waitForURL(/\/admin\/articles$/);
    await expect.poll(() => publicStatus(postUrl)).toBe(404);
    await page.goto("/admin/corbeille");
    const row = page.getByRole("row").filter({ hasText: TITLE });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Restaurer" }).click();
    await expect(page.getByRole("row").filter({ hasText: TITLE })).toHaveCount(0);
    await expect.poll(() => publicStatus(postUrl)).toBe(200);
  });
});

test.describe("media upload hazards", () => {
  let ctx: BrowserContext;
  test.beforeAll(async ({ browser }) => {
    ctx = await newClientContext(browser);
    await login(await ctx.newPage(), "editor");
  });
  test.afterAll(async () => ctx?.close());

  const upload = (name: string, mimeType: string, buffer: Buffer, headers: Record<string, string> = { origin: ORIGIN }) =>
    ctx.request.post("/admin/mediatheque/upload", { headers, multipart: { file: { name, mimeType, buffer }, alt: "Image de test E2E" } });

  test("real JPEG succeeds, is re-encoded, served as raster, never enlarged", async () => {
    const res = await upload("photo-test.jpg", "image/jpeg", await makeJpeg(1200, 800));
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { ok: boolean; media: { id: string; storageKey: string } };
    expect(body.ok).toBe(true);
    const served = await ctx.request.get(`/media/${body.media.storageKey}`);
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toMatch(/^image\/(webp|jpeg|avif)/);
    expect(served.headers()["x-content-type-options"]).toBe("nosniff");
    const sharp = (await import("sharp")).default;
    const meta = await sharp(await served.body()).metadata();
    expect(meta.width).toBeLessThanOrEqual(1200); // withoutEnlargement
    expect(meta.exif).toBeUndefined();
    expect((await ctx.request.get(`/media/${body.media.storageKey.replace(/\.webp$/, "-w2400.webp")}`)).status()).toBe(404);
  });

  test("SVG, HTML, PHP, GIF, empty and truncated files renamed .jpg are rejected", async () => {
    const hostile: [string, Buffer][] = [
      ["evil.jpg", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
      ["page.jpg", Buffer.from("<!doctype html><html><script>alert(1)</script></html>")],
      ["shell.jpg", Buffer.from("<?php system($_GET['c']); ?>")],
      ["anim.jpg", Buffer.from("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b", "hex")],
      ["empty.jpg", Buffer.alloc(0)],
      ["truncated.jpg", Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])],
    ];
    for (const [name, buf] of hostile) {
      const res = await upload(name, "image/jpeg", buf);
      expect(res.status(), name).toBeGreaterThanOrEqual(400);
      expect(res.status(), name).toBeLessThan(500);
    }
  });

  test("script payload appended to a valid JPEG does not survive re-encoding", async () => {
    const jpeg = Buffer.concat([await makeJpeg(400, 300), Buffer.from("<script>alert('polyglot')</script>")]);
    const res = await upload("polyglot.jpg", "image/jpeg", jpeg);
    if (res.ok()) {
      const { media } = (await res.json()) as { media: { storageKey: string } };
      const bytes = await (await ctx.request.get(`/media/${media.storageKey}`)).body();
      expect(bytes.toString("latin1")).not.toContain("<script>");
    } else {
      expect(res.status()).toBeLessThan(500);
    }
  });

  test("cross-origin / missing-origin uploads and oversize bodies are refused", async () => {
    const jpeg = await makeJpeg(64, 64);
    expect((await upload("a.jpg", "image/jpeg", jpeg, { origin: "https://evil.example" })).status()).toBe(403);
    expect((await upload("a.jpg", "image/jpeg", jpeg, {})).status()).toBe(403);
    const big = Buffer.alloc(16 * 1024 * 1024 + 1024, 1);
    expect((await upload("big.jpg", "image/jpeg", big)).status()).toBe(413);
  });

  test("private storage is not reachable through /media (traversal and leads/ keys)", async ({ request }) => {
    for (const p of ["/media/leads/2026/11/abcdef.jpg", "/media/..%2fprivate%2fleads%2fx.jpg", "/media/%2e%2e/%2e%2e/package.json", "/media/2026/11/x.svg", "/media/2026/11/x.html"]) {
      const res = await request.get(p, { maxRedirects: 0 });
      expect([400, 404], p).toContain(res.status());
    }
  });
});

test("fakeIp helper yields distinct values", () => {
  expect(fakeIp()).not.toBe(fakeIp());
});
