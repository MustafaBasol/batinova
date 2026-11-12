import { expect, test, type Page } from "@playwright/test";

const PATHS = [
  "/", "/a-propos", "/notre-methode", "/services", "/services/renovation", "/services/extension", "/services/construction",
  "/zones-intervention", "/zones-intervention/ile-de-france", "/zones-intervention/normandie", "/zones-intervention/manche",
  "/contact", "/devis", "/blog", "/realisations", "/mentions-legales", "/politique-de-confidentialite",
];

async function noHorizontalOverflow(page: Page) {
  return page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
}

for (const vp of [{ name: "360px", width: 360, height: 740 }, { name: "1280px", width: 1280, height: 800 }]) {
  test.describe(`public pages @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });
    for (const path of PATHS) {
      test(`${path}: 200, lang fr, single h1, no horizontal overflow`, async ({ page }) => {
        const res = await page.goto(path);
        expect(res?.status()).toBe(200);
        await expect(page.locator("html")).toHaveAttribute("lang", "fr");
        await expect(page.locator("h1")).toHaveCount(1);
        expect((await page.title()).length).toBeGreaterThan(5);
        await expect(page.locator("main")).toHaveCount(1);
        const { sw, cw } = await noHorizontalOverflow(page);
        expect(sw, `scrollWidth ${sw} > clientWidth ${cw}`).toBeLessThanOrEqual(cw);
      });
    }
  });
}

test.describe("404 page", () => {
  test("unknown URL returns 404, lang=fr, noindex, French copy, link home", async ({ page, request }) => {
    const res = await page.goto("/cette-page-n-existe-pas");
    expect(res?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.locator("h1")).toHaveCount(1);
    const robots = (await page.locator('meta[name="robots"]').evaluateAll((els) => els.map((e) => e.getAttribute("content")))).join(",");
    expect(robots).toContain("noindex");
    await expect(page.getByRole("link", { name: /accueil/i }).first()).toBeVisible();
    expect((await request.get("/blog/article-inexistant")).status()).toBe(404);
    expect((await request.get("/realisations/inexistant")).status()).toBe(404);
    expect((await request.get("/services/inexistant")).status()).toBe(404);
  });
});

test.describe("404 page without JavaScript", () => {
  test.use({ javaScriptEnabled: false });
  for (const path of ["/cette-page-n-existe-pas", "/blog/article-inexistant", "/blog/categorie/inexistante", "/blog/etiquette/inexistante", "/realisations/inexistant", "/services/inexistant"]) {
    test(`server HTML of ${path}: 404, noindex, French message, link home`, async ({ page, request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(404);
      expect(res.headers()["x-robots-tag"]).toContain("noindex");
      const html = await res.text();
      expect(html).toContain('<html lang="fr">');
      expect(html).not.toContain("__next_error__");
      await page.goto(path);
      await expect(page.locator("h1")).toHaveText("Cette page est introuvable.");
      await expect(page.getByRole("link", { name: /Retour à l’accueil/ })).toHaveAttribute("href", "/");
    });
  }
});

test.describe("mobile menu keyboard", () => {
  test.use({ viewport: { width: 360, height: 740 } });
  test("open, focus inside, Tab trap, Esc closes and returns focus", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /^Menu/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Menu principal" });
    await expect(dialog).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const inside = () => page.evaluate(() => !!document.activeElement?.closest("#menu-mobile"));
    expect(await inside()).toBe(true);
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      expect(await inside(), `focus escaped on Tab #${i + 1}`).toBe(true);
    }
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await inside(), `focus escaped on Shift+Tab #${i + 1}`).toBe(true);
    }
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(toggle).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
  });

  test("selecting a link navigates and closes the menu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Menu/ }).click();
    const dialog = page.getByRole("dialog", { name: "Menu principal" });
    await dialog.getByRole("link", { name: /^Blog/ }).first().click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(dialog).toBeHidden();
  });

  test("skip link and focus visibility basics", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const first = page.locator(":focus");
    await expect(first).toHaveAttribute("href", /#/);
    await expect(first).toBeVisible();
  });
});
