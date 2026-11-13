import { expect, test, type Page } from "@playwright/test";
import { fakeIp, login, newClientContext } from "./helpers";

const MOBILE = { width: 390, height: 844 };

async function fillThrough(page: Page, opts: { email: string; name?: string; honeypot?: string }) {
  await page.goto("/devis");
  await page.locator("label.choice", { hasText: /^Rénovation$/ }).first().click();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Code postal").fill("93600");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Continuer" }).click(); // budget / délais optional
  await page.getByLabel("Description").fill("Rénovation complète d’un appartement de 60 m², cuisine et salle de bains.");
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByLabel("Nom et prénom").fill(opts.name ?? "Test Prospect E2E");
  await page.getByLabel("Adresse e-mail").fill(opts.email);
  if (opts.honeypot) await page.locator('input[name="website"]').evaluate((el, v) => ((el as HTMLInputElement).value = v), opts.honeypot);
  await page.getByRole("checkbox").check();
  await page.waitForTimeout(3300); // server-side minimum fill time is 3 s
  await page.getByRole("button", { name: "Envoyer ma demande" }).click();
}

test.describe("quote flow (mobile)", () => {
  test.use({ viewport: MOBILE, isMobile: true, hasTouch: true });

  test("per-step validation, consent required, success screen, lead visible in admin inbox", async ({ browser }) => {
    const ctx = await newClientContext(browser, { viewport: MOBILE, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto("/devis");
    // submit button must not be shown on step 1 (hidden utility vs .btn regression)
    await expect(page.getByRole("button", { name: "Envoyer ma demande" })).toBeHidden();
    // step 1: nothing chosen
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Merci de corriger");
    await expect(page.locator("form").getByRole("alert")).toContainText("Choisissez un type de projet");
    await page.locator("label.choice", { hasText: /^Rénovation$/ }).first().click();
    await page.getByRole("button", { name: "Continuer" }).click();
    // step 2: invalid postal code
    await page.getByLabel("Code postal").fill("123");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Code postal");
    // Retry fill+assert: on a slow runner the first fill can land before React hydrates and is then reset.
    await expect(async () => {
      await page.getByLabel("Code postal").fill("93600");
      await expect(page.getByText(/Zone détectée : Île-de-France/)).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    // step 4: too short
    await page.getByLabel("Description").fill("court");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Décrivez votre projet");
    await page.getByLabel("Description").fill("Rénovation complète d’un appartement de 60 m², cuisine et salle de bains.");
    await page.getByRole("button", { name: "Continuer" }).click();
    // step 5: bad e-mail + no consent
    await page.getByLabel("Nom et prénom").fill("Test Prospect E2E");
    await page.getByLabel("Adresse e-mail").fill("pas-un-email");
    await page.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Adresse e-mail invalide");
    await page.getByLabel("Adresse e-mail").fill("prospect.e2e@example.test");
    await page.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("Votre accord est nécessaire");
    // success
    await page.getByRole("checkbox").check();
    await page.waitForTimeout(3300);
    await page.getByRole("button", { name: "Envoyer ma demande" }).click();
    await expect(page.getByRole("heading", { name: /votre demande nous est bien parvenue/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(page.url()).not.toContain("prospect.e2e"); // no PII in URL
    await ctx.close();

    // visible in admin inbox
    const admin = await newClientContext(browser);
    const ap = await admin.newPage();
    await login(ap, "owner");
    await ap.goto("/admin/demandes");
    await expect(ap.getByText("Test Prospect E2E").first()).toBeVisible();
    await ap.getByText("Test Prospect E2E").first().click();
    await expect(ap.getByText("prospect.e2e@example.test").first()).toBeVisible();
    await admin.close();
  });

  test("honeypot is silently rejected (success screen, nothing stored)", async ({ browser }) => {
    const ctx = await newClientContext(browser, { viewport: MOBILE, isMobile: true });
    const page = await ctx.newPage();
    await fillThrough(page, { email: "bot.honeypot@example.test", name: "Robot Honeypot", honeypot: "http://spam.example" });
    await expect(page.getByRole("heading", { name: /votre demande nous est bien parvenue/ })).toBeVisible();
    await ctx.close();
    const admin = await newClientContext(browser);
    const ap = await admin.newPage();
    await login(ap, "owner");
    await ap.goto("/admin/demandes?q=Honeypot");
    await expect(ap.getByText("Robot Honeypot")).toHaveCount(0);
    await admin.close();
  });

  test("per-e-mail rate limit returns a French throttling message after 3 leads", async ({ browser }) => {
    const email = `limit.${Date.now()}@example.test`;
    const ctx = await newClientContext(browser, { viewport: MOBILE, isMobile: true, extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
    const page = await ctx.newPage();
    for (let i = 0; i < 3; i++) {
      await fillThrough(page, { email, name: `Limite ${i}` });
      await expect(page.getByRole("heading", { name: /votre demande nous est bien parvenue/ })).toBeVisible();
    }
    await fillThrough(page, { email, name: "Limite 4" });
    await expect(page.locator("form").getByRole("alert")).toContainText("Trop de demandes envoyées");
    await ctx.close();
  });
});
