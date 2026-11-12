import { describe, expect, it } from "vitest";
import {
  emptyDoc,
  estimateReadingMinutes,
  linkRel,
  parseRichText,
  richTextExcerpt,
  richTextToPlainText,
  validateRichText,
} from "@/lib/richtext/schema";

const p = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: unknown[]) => (marks ? { type: "text", text, marks } : { type: "text", text });
const doc = (...content: unknown[]) => ({ type: "doc", content });
const link = (href: string, extra: Record<string, unknown> = {}) => doc(p(t("lien", [{ type: "link", attrs: { href, ...extra } }])));

describe("validateRichText — accepted content", () => {
  it("accepts a typical article", () => {
    const res = validateRichText(
      doc(
        { type: "heading", attrs: { level: 2, textAlign: "left" }, content: [t("Les étapes clés")] },
        p(t("Texte "), t("gras", [{ type: "bold" }]), { type: "hardBreak" }, t("suite", [{ type: "textStyle", attrs: { fontSize: "lg", color: "bronze" } }])),
        { type: "bulletList", content: [{ type: "listItem", content: [p(t("Point"))] }] },
        { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p(t("Un"))] }] },
        { type: "blockquote", content: [p(t("Citation"))] },
        { type: "callout", attrs: { variant: "retenir" }, content: [p(t("À retenir"))] },
        { type: "horizontalRule" },
        { type: "image", attrs: { mediaId: "abc123", alt: "Chantier de rénovation", size: "full" } },
        {
          type: "table",
          content: [
            { type: "tableRow", content: [{ type: "tableHeader", content: [p(t("Poste"))] }] },
            { type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: [p(t("Gros œuvre"))] }] },
          ],
        },
        p(t("surligné", [{ type: "highlight", attrs: { color: "sand" } }])),
      ),
    );
    expect(res.ok).toBe(true);
  });

  it("accepts safe links and normalizes Tiptap's default link attrs", () => {
    for (const href of ["https://example.org", "http://example.org", "/contact", "mailto:a@b.fr", "tel:+33123456789", "#section"]) {
      expect(validateRichText(link(href)).ok, href).toBe(true);
    }
    const res = validateRichText(link("https://example.org", { target: "_blank", rel: "noopener noreferrer nofollow", class: null }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const mark = res.doc.content[0]!.content![0]!.marks![0]!;
      expect(mark.attrs).toEqual({ href: "https://example.org", nofollow: false, target: "_blank" });
    }
  });

  it("drops null Tiptap default attrs", () => {
    const res = validateRichText(doc({ type: "paragraph", attrs: { textAlign: null }, content: [t("x")] }));
    expect(res.ok && res.doc.content[0]!.attrs).toBeFalsy();
  });
});

describe("validateRichText — XSS / injection rejection", () => {
  it.each([
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    "  javascript:alert(1)",
    "java\nscript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "vbscript:msgbox(1)",
    "//evil.example/x",
    "https://user:pw@evil.example",
    "file:///etc/passwd",
  ])("rejects link href %j", (href) => {
    expect(validateRichText(link(href)).ok).toBe(false);
  });

  it("rejects raw style / class / on* attributes", () => {
    expect(validateRichText(doc({ type: "paragraph", attrs: { style: "background:url(javascript:alert(1))" }, content: [t("x")] })).ok).toBe(false);
    expect(validateRichText(doc({ type: "paragraph", attrs: { onclick: "alert(1)" }, content: [t("x")] })).ok).toBe(false);
    expect(validateRichText(doc(p(t("x", [{ type: "textStyle", attrs: { color: "red; background: url(x)" } }])))).ok).toBe(false);
    expect(validateRichText(doc(p(t("x", [{ type: "textStyle", attrs: { fontSize: "99px" } }])))).ok).toBe(false);
    expect(validateRichText(doc(p(t("x", [{ type: "textStyle", attrs: { style: "x" } }])))).ok).toBe(false);
  });

  it("rejects unknown nodes and marks (html, iframe, script, code)", () => {
    expect(validateRichText(doc({ type: "html", attrs: { html: "<script>alert(1)</script>" } })).ok).toBe(false);
    expect(validateRichText(doc({ type: "iframe", attrs: { src: "https://evil.example" } })).ok).toBe(false);
    expect(validateRichText(doc({ type: "codeBlock", content: [t("x")] })).ok).toBe(false);
    expect(validateRichText(doc(p(t("x", [{ type: "script" }])))).ok).toBe(false);
  });

  it("rejects images with src URLs, missing alt or unknown size", () => {
    expect(validateRichText(doc({ type: "image", attrs: { src: "javascript:alert(1)", alt: "x" } })).ok).toBe(false);
    expect(validateRichText(doc({ type: "image", attrs: { mediaId: "m1", alt: "x", src: "https://evil.example/x.png" } })).ok).toBe(false);
    expect(validateRichText(doc({ type: "image", attrs: { mediaId: "m1" } })).ok).toBe(false);
    expect(validateRichText(doc({ type: "image", attrs: { mediaId: "m1", alt: "  " } })).ok).toBe(false);
    expect(validateRichText(doc({ type: "image", attrs: { mediaId: "../../etc", alt: "x" } })).ok).toBe(false);
    expect(validateRichText(doc({ type: "image", attrs: { mediaId: "m1", alt: "x", size: "huge" } })).ok).toBe(false);
  });

  it("rejects h1 / h5 headings and invalid nesting", () => {
    expect(validateRichText(doc({ type: "heading", attrs: { level: 1 }, content: [t("x")] })).ok).toBe(false);
    expect(validateRichText(doc({ type: "heading", attrs: { level: 5 }, content: [t("x")] })).ok).toBe(false);
    expect(validateRichText(doc(t("bare text at top level"))).ok).toBe(false);
    expect(validateRichText(doc(p({ type: "paragraph" }))).ok).toBe(false);
    expect(validateRichText(doc({ type: "bulletList", content: [] })).ok).toBe(false);
  });

  it("rejects extra properties and non-doc roots", () => {
    expect(validateRichText({ type: "paragraph" }).ok).toBe(false);
    expect(validateRichText("<p>hi</p>").ok).toBe(false);
    expect(validateRichText(doc({ type: "paragraph", content: [t("x")], html: "<b>" })).ok).toBe(false);
    expect(validateRichText({ type: "doc", content: [], __proto__x: 1 }).ok).toBe(false);
  });

  it("rejects excessive depth", () => {
    let node: Record<string, unknown> = p(t("deep"));
    for (let i = 0; i < 20; i++) node = { type: "blockquote", content: [node] };
    // blockquote cannot contain blockquote -> rejected regardless; also use lists
    expect(validateRichText(doc(node)).ok).toBe(false);
    let list: Record<string, unknown> = p(t("deep"));
    for (let i = 0; i < 10; i++) list = { type: "bulletList", content: [{ type: "listItem", content: [p(t("x")), list] }] };
    expect(validateRichText(doc(list)).ok).toBe(false);
  });

  it("parseRichText falls back to an empty doc for invalid input", () => {
    expect(parseRichText({ type: "html" })).toEqual(emptyDoc());
  });
});

describe("rich-text helpers", () => {
  const sample = doc(
    { type: "heading", attrs: { level: 2 }, content: [t("Titre")] },
    p(t("Bonjour "), t("le monde", [{ type: "bold" }])),
    { type: "bulletList", content: [{ type: "listItem", content: [p(t("Un"))] }, { type: "listItem", content: [p(t("Deux"))] }] },
  );

  it("richTextToPlainText flattens text with line breaks", () => {
    expect(richTextToPlainText(sample)).toBe("Titre\nBonjour le monde\nUn\nDeux");
  });

  it("estimates reading time and builds excerpts", () => {
    expect(estimateReadingMinutes(sample)).toBe(1);
    const long = doc(p(t(Array.from({ length: 660 }, () => "mot").join(" "))));
    expect(estimateReadingMinutes(long)).toBe(3);
    expect(richTextExcerpt(long, 50).length).toBeLessThanOrEqual(50);
    expect(richTextExcerpt(long, 50).endsWith("…")).toBe(true);
  });

  it("linkRel adds noopener for external and nofollow on request", () => {
    expect(linkRel({ href: "https://x.fr" })).toBe("noopener noreferrer");
    expect(linkRel({ href: "/contact", nofollow: true })).toBe("nofollow");
    expect(linkRel({ href: "/contact" })).toBeUndefined();
  });
});
