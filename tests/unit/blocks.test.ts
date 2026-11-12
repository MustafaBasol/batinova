import { describe, expect, it } from "vitest";
import { BLOCK_TYPES, BlocksSchema, collectMediaIds, parseBlocks } from "@/lib/blocks/schema";
import { isSafeHref } from "@/lib/security/href";

describe("isSafeHref", () => {
  it.each(["/contact", "/blog?page=2", "#devis", "https://btnv.fr/x", "mailto:contact@btnv.fr", "tel:+33123456789", "tel:+33-1-23-45-67-89"])(
    "accepts %s",
    (h) => expect(isSafeHref(h)).toBe(true),
  );
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "//evil.example",
    "/\\evil.example",
    "http://insecure.example",
    "https://user:pass@evil.example",
    "",
    "contact",
    "tel:+33 1 23 45 67 89",
  ])("rejects %j", (h) => expect(isSafeHref(h)).toBe(false));

  it("allows http only when opted in", () => {
    expect(isSafeHref("http://example.org", { allowHttp: true })).toBe(true);
  });
});

describe("block schema", () => {
  it("rejects javascript: hrefs in ctaBand and hero", () => {
    const res = BlocksSchema.safeParse([
      { type: "ctaBand", heading: "Devis", label: "Go", href: "javascript:alert(1)" },
    ]);
    expect(res.success).toBe(false);
    const hero = BlocksSchema.safeParse([{ type: "hero", heading: "x", ctaLabel: "y", ctaHref: "javascript:void(0)" }]);
    expect(hero.success).toBe(false);
  });

  it("rejects unknown block types", () => {
    expect(BlocksSchema.safeParse([{ type: "html", html: "<script>" }]).success).toBe(false);
  });

  it("parseBlocks keeps valid blocks and drops invalid ones with reasons", () => {
    const { blocks, dropped } = parseBlocks([
      { type: "hero", heading: "Construire autrement." },
      { type: "html", html: "<b>x</b>" },
      { type: "ctaBand", heading: "x", label: "y", href: "data:text/html,x" },
      { type: "faq", items: [{ question: "Q ?", answer: "R." }] },
      "garbage",
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["hero", "faq"]);
    expect(dropped).toHaveLength(3);
    expect(dropped[0]).toMatchObject({ index: 1, type: "html" });
    expect(dropped.every((d) => d.reason.length > 0)).toBe(true);
  });

  it("parseBlocks tolerates non-array input", () => {
    expect(parseBlocks(null).blocks).toEqual([]);
    expect(parseBlocks({ a: 1 }).dropped).toHaveLength(1);
  });

  it("richText block requires a valid Tiptap doc", () => {
    const ok = parseBlocks([{ type: "richText", doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Bonjour" }] }] } }]);
    expect(ok.blocks).toHaveLength(1);
    const bad = parseBlocks([{ type: "richText", markdown: "# legacy" }]);
    expect(bad.blocks).toHaveLength(0);
  });

  it("registry covers every block type with a French label", () => {
    for (const [type, def] of Object.entries(BLOCK_TYPES)) {
      expect(def.label.length).toBeGreaterThan(2);
      expect(def.defaults.type).toBe(type);
    }
  });

  it("collectMediaIds gathers hero, image, gallery and rich-text images", () => {
    const { blocks } = parseBlocks([
      { type: "hero", heading: "h", imageId: "m1" },
      { type: "image", mediaId: "m2" },
      { type: "gallery", mediaIds: ["m3", "m1"] },
      { type: "richText", doc: { type: "doc", content: [{ type: "image", attrs: { mediaId: "m4", alt: "Façade" } }] } },
    ]);
    expect(collectMediaIds(blocks).sort()).toEqual(["m1", "m2", "m3", "m4"]);
  });
});
