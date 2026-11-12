/* eslint-disable @typescript-eslint/no-explicit-any -- tests inspect loosely typed Next Metadata / JSON-LD objects */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { db, resetDb } from "../support/db";
import { RichText } from "@/components/richtext/RichText";
import { BlockRenderer } from "@/components/blocks/BlockRenderer";
import { ResponsiveImage } from "@/components/media/ResponsiveImage";
import { generateMetadata as tagMetadata } from "@/app/(site)/blog/etiquette/[slug]/page";
import { generateMetadata as postMetadata } from "@/app/(site)/blog/[slug]/page";

beforeEach(resetDb);
afterEach(() => vi.unstubAllEnvs());

const emptyDoc = { type: "doc", content: [{ type: "paragraph" }] };

describe("seo-routes: tag archive and drafts", () => {
  it("tag archives are noindex,follow even in production", async () => {
    vi.stubEnv("SITE_INDEXING", "true");
    await db.tag.create({ data: { slug: "budget", name: "Budget" } });
    const m = await tagMetadata({ params: Promise.resolve({ slug: "budget" }), searchParams: Promise.resolve({}) });
    expect((m.robots as any).index).toBe(false);
    expect((m.robots as any).follow).toBe(true);
  });
  it("a draft post yields not-found metadata (noindex, no canonical)", async () => {
    await db.post.create({ data: { slug: "brouillon", title: "B", body: emptyDoc, status: "DRAFT" } });
    const m = await postMetadata({ params: Promise.resolve({ slug: "brouillon" }) });
    expect((m.robots as any).index).toBe(false);
    expect(m.alternates).toBeUndefined();
  });
  it("a published post exposes article OG, canonical and a >=1200px cover image", async () => {
    vi.stubEnv("SITE_INDEXING", "true");
    const cover = await db.media.create({
      data: {
        storageKey: "ab/cover.webp",
        originalName: "c.jpg",
        mime: "image/webp",
        sizeBytes: 10,
        width: 2000,
        height: 1333,
        alt: "Une couverture",
        licenseType: "STOCK_FREE",
        variants: [
          { key: "ab/cover-800.webp", width: 800, height: 533, format: "webp" },
          { key: "ab/cover-1200.webp", width: 1200, height: 800, format: "webp" },
          { key: "ab/cover.webp", width: 2000, height: 1333, format: "webp" },
        ],
      },
    });
    await db.post.create({
      data: { slug: "publie", title: "Publié", excerpt: "Extrait", body: emptyDoc, status: "PUBLISHED", publishedAt: new Date(Date.now() - 1000), coverImageId: cover.id },
    });
    const m = await postMetadata({ params: Promise.resolve({ slug: "publie" }) });
    expect(m.alternates?.canonical).toBe("https://btnv.fr/blog/publie");
    expect((m.openGraph as any).type).toBe("article");
    expect((m.openGraph as any).images[0]).toMatchObject({ url: "https://btnv.fr/media/ab/cover-1200.webp", width: 1200, alt: "Une couverture" });
    expect((m.robots as any).index).toBe(true);
  });
});

const media = {
  m1: { id: "m1", storageKey: "ab/x.webp", width: 1200, height: 800, alt: "Cuisine ouverte avec îlot central", variants: [] },
  m2: { id: "m2", storageKey: "ab/y.webp", width: 1200, height: 800, alt: "", variants: [] },
};

describe("seo-images: rendered HTML never has an <img> without alt", () => {
  const imgs = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];

  it("ResponsiveImage always outputs alt (empty only when explicitly decorative)", () => {
    const html = renderToStaticMarkup(h(ResponsiveImage, { media: media.m2, alt: "" }));
    expect(imgs(html)).toHaveLength(1);
    expect(imgs(html)[0]).toMatch(/\balt=""/);
  });
  it("rich text images carry their (required) alt", () => {
    const doc = { type: "doc", content: [{ type: "image", attrs: { mediaId: "m1", alt: "Cuisine ouverte avec îlot central", size: "medium" } }] };
    const html = renderToStaticMarkup(h(RichText, { doc, media }));
    const list = imgs(html);
    expect(list).toHaveLength(1);
    expect(list.every((i) => /\balt="[^"]+"/.test(i))).toBe(true);
  });
  it("block images (hero, image, gallery) always render an alt attribute", () => {
    const blocks = [
      { type: "hero", heading: "Titre", imageId: "m1" },
      { type: "image", mediaId: "m1", caption: "Légende" },
      { type: "gallery", mediaIds: ["m1", "m2"] },
    ] as any;
    const html = renderToStaticMarkup(h(BlockRenderer, { blocks, media, h1: true }));
    const list = imgs(html);
    expect(list.length).toBeGreaterThanOrEqual(3);
    expect(list.every((i) => /\balt=/.test(i))).toBe(true);
  });
});
