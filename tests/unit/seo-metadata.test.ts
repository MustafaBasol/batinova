/* eslint-disable @typescript-eslint/no-explicit-any -- tests inspect loosely typed Next Metadata / JSON-LD objects */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMetadata, cleanTitle, normalizeCanonicalPath } from "@/lib/seo/metadata";

afterEach(() => vi.unstubAllEnvs());
const on = () => vi.stubEnv("SITE_INDEXING", "true");
// buildMetadata returns Next Metadata; we inspect plain objects.
type M = ReturnType<typeof buildMetadata>;
const og = (m: M) => m.openGraph as Record<string, any>;
const robots = (m: M) => m.robots as Record<string, any>;

describe("seo-metadata: titles", () => {
  it("strips a trailing brand suffix so the layout template never doubles it", () => {
    expect(cleanTitle("À propos | BatiNova Construction")).toBe("À propos");
    expect(cleanTitle("À propos – BatiNova")).toBe("À propos");
    expect(cleanTitle("Rénovation de maison")).toBe("Rénovation de maison");
    // brand at the start (home title) is untouched
    expect(cleanTitle("BatiNova Construction — Construire autrement.")).toBe("BatiNova Construction — Construire autrement.");
  });
});

describe("seo-metadata: canonical", () => {
  it("is absolute on the canonical origin, without trailing slash", () => {
    on();
    expect(buildMetadata({ title: "x", path: "/services/renovation/" }).alternates?.canonical).toBe("https://btnv.fr/services/renovation");
    expect(buildMetadata({ title: "x", path: "/" }).alternates?.canonical).toBe("https://btnv.fr");
    expect(buildMetadata({ title: "x", path: "/blog?page=2" }).alternates?.canonical).toBe("https://btnv.fr/blog?page=2");
  });
  it("honours same-origin canonicalPath and refuses foreign origins", () => {
    expect(normalizeCanonicalPath("https://btnv.fr/blog/a/")).toBe("/blog/a");
    expect(normalizeCanonicalPath("https://evil.example/x")).toBe("/");
  });
});

describe("seo-metadata: Open Graph / Twitter", () => {
  it("emits fr_FR, site name, default 1200x630 image with alt, summary_large_image", () => {
    on();
    const m = buildMetadata({ title: "Page", description: "Desc", path: "/page" });
    expect(og(m).locale).toBe("fr_FR");
    expect(og(m).siteName).toBe("BatiNova Construction");
    expect(og(m).type).toBe("website");
    expect(og(m).images[0]).toMatchObject({ url: "https://btnv.fr/brand/og-default.jpg", width: 1200, height: 630 });
    expect(og(m).images[0].alt).toBeTruthy();
    expect((m.twitter as any).card).toBe("summary_large_image");
  });
  it("uses the entity image (absolute URL) and article fields", () => {
    on();
    const m = buildMetadata({
      title: "Article",
      path: "/blog/article",
      type: "article",
      publishedTime: new Date("2026-01-02T10:00:00Z"),
      section: "Budget",
      ogImage: { url: "/media/a/b.webp", width: 1600, height: 900, alt: "Alt" },
    });
    expect(og(m).type).toBe("article");
    expect(og(m).images[0]).toEqual({ url: "https://btnv.fr/media/a/b.webp", width: 1600, height: 900, alt: "Alt" });
    expect(og(m).publishedTime).toBe("2026-01-02T10:00:00.000Z");
    expect(og(m).section).toBe("Budget");
  });
});

describe("seo-metadata: description fallbacks", () => {
  it("entity -> site default -> generated excerpt", () => {
    expect(buildMetadata({ title: "x", path: "/", description: "E", defaultDescription: "D", fallbackText: "F" }).description).toBe("E");
    expect(buildMetadata({ title: "x", path: "/", description: " ", defaultDescription: "D", fallbackText: "F" }).description).toBe("D");
    const long = "mot ".repeat(100);
    const d = buildMetadata({ title: "x", path: "/", fallbackText: long }).description as string;
    expect(d.length).toBeLessThanOrEqual(161);
    expect(d.endsWith("…")).toBe(true);
  });
});

describe("seo-metadata: robots", () => {
  it("indexes only when SITE_INDEXING=true and the entity allows it", () => {
    on();
    expect(robots(buildMetadata({ title: "x", path: "/" })).index).toBe(true);
    expect(robots(buildMetadata({ title: "x", path: "/", noindex: true })).index).toBe(false);
    expect(robots(buildMetadata({ title: "x", path: "/", noindex: true })).follow).toBe(true);
    expect(robots(buildMetadata({ title: "x", path: "/", isPlaceholder: true })).index).toBe(false);
  });
  it("blocks every page outside production (SITE_INDEXING unset or not 'true')", () => {
    vi.stubEnv("SITE_INDEXING", "");
    expect(robots(buildMetadata({ title: "x", path: "/" })).index).toBe(false);
    vi.stubEnv("SITE_INDEXING", "1");
    expect(robots(buildMetadata({ title: "x", path: "/" })).index).toBe(false);
  });
});
