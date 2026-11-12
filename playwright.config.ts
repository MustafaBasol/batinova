import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a PRODUCTION build served by `next start` on port 3500 with an isolated DB/storage in
 * .tmp/e2e (see tests/e2e/start-server.mjs). Run `npm run build` first.
 * Over plain http the browser still accepts the `__Host-`/Secure session cookie because Chromium treats
 * http://localhost as a secure context; no production default is weakened.
 */
const PORT = Number(process.env.E2E_PORT ?? 3500);

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: ".tmp/e2e-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "off",
    screenshot: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node tests/e2e/start-server.mjs",
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
