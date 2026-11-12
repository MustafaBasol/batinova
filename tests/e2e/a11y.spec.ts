import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES: [string, string][] = [
  ["home", "/"], ["service", "/services/renovation"], ["zone", "/zones-intervention/manche"], ["devis", "/devis"],
  ["blog index", "/blog"], ["contact", "/contact"], ["mentions légales", "/mentions-legales"], ["404", "/page-introuvable-axe"],
];

for (const vp of [{ n: "mobile", width: 360, height: 740 }, { n: "desktop", width: 1280, height: 800 }]) {
  for (const [label, path] of PAGES) {
    test(`axe wcag2a/aa: ${label} (${vp.n})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(path);
      // Let entrance animations settle (scroll-driven / infinite ones never finish: cap the wait) so axe measures final colours.
      await page.evaluate(() =>
        Promise.race([
          Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))),
          new Promise((r) => setTimeout(r, 2500)),
        ]),
      );
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`);
      expect(summary, summary.join("\n")).toEqual([]);
    });
  }
}
