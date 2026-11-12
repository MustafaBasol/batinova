import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type BrowserContext, type Page } from "@playwright/test";

export const root = path.resolve(import.meta.dirname, "../..");
export const creds = JSON.parse(readFileSync(path.join(root, ".tmp", "e2e", "creds.json"), "utf8")) as Record<"owner" | "editor" | "lockout", { email: string; password: string }>;

let n = 0;
/** Unique fake client IP per call: TRUST_PROXY=true on the E2E server => isolated rate-limit buckets. */
export function fakeIp(): string {
  n += 1;
  return `10.${Math.floor(Math.random() * 200) + 20}.${Math.floor(Math.random() * 250)}.${(n % 250) + 1}`;
}

export async function newClientContext(browser: import("@playwright/test").Browser, opts: Parameters<import("@playwright/test").Browser["newContext"]>[0] = {}): Promise<BrowserContext> {
  return browser.newContext({ ...opts, extraHTTPHeaders: { "x-forwarded-for": fakeIp(), ...(opts.extraHTTPHeaders ?? {}) } });
}

export async function login(page: Page, who: "owner" | "editor", next?: string) {
  await page.goto(next ? `/admin/login?next=${encodeURIComponent(next)}` : "/admin/login");
  await page.getByLabel("Adresse e-mail").fill(creds[who].email);
  await page.getByLabel("Mot de passe").fill(creds[who].password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/admin/login"));
  await expect(page).toHaveURL(/\/admin/);
}

/** Tiny valid JPEG generated at runtime (no binary committed). */
export async function makeJpeg(width = 1200, height = 800): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 110, b: 100 } } })
    .composite([{ input: { text: { text: "E2E", rgba: true, dpi: 200 } }, gravity: "center" }])
    .jpeg({ quality: 70 })
    .toBuffer();
}
