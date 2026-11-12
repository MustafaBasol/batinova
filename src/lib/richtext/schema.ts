/**
 * Rich text contract — WHITELISTED Tiptap (ProseMirror) JSON
 * (owner: architect-security; FROZEN for Phase 2-4). Isomorphic.
 *
 * Used by Post.body and the `richText` CMS block. The admin editor (cms-admin)
 * must configure Tiptap with exactly these nodes/marks/attributes; the public
 * renderer (design-frontend) maps each node/mark to React elements and preset
 * CSS classes — never `dangerouslySetInnerHTML`, never raw style strings.
 *
 * Server code MUST call validateRichText() before saving and SHOULD render the
 * returned normalized `doc` (unknown null attrs stripped, link rel recomputed).
 *
 * Nodes: doc, paragraph, heading(level 2|3|4), text, hardBreak, bulletList,
 *   orderedList(start), listItem, blockquote, horizontalRule, callout(variant),
 *   image(mediaId, alt, caption?, size), table, tableRow, tableHeader, tableCell.
 * Marks: bold, italic, underline, strike, subscript, superscript,
 *   link(href, nofollow, target), textStyle(fontSize?, color?), highlight(color).
 * Block attr: textAlign on paragraph/heading (left|center|right|justify).
 */
import { z } from "zod";
import { isSafeHref } from "@/lib/security/href";

// ---------------------------------------------------------------- presets

/** Font-size presets -> renderer CSS classes. No arbitrary sizes. */
export const FONT_SIZES = { sm: "Petit", base: "Normal", lg: "Grand", xl: "Très grand" } as const;
export type FontSizeKey = keyof typeof FONT_SIZES;

/** Text colours: contrast-safe on white / off-white (>= 4.5:1). */
export const TEXT_COLORS = {
  charcoal: { label: "Anthracite", hex: "#303030" },
  graphite: { label: "Gris foncé", hex: "#4A4A4A" },
  bronze: { label: "Beige foncé", hex: "#6E5F4E" },
} as const;
export type TextColorKey = keyof typeof TEXT_COLORS;

/** Highlight backgrounds: light tints, used with charcoal text. */
export const HIGHLIGHT_COLORS = {
  beige: { label: "Beige", hex: "#E6DDD2" },
  sand: { label: "Sable", hex: "#F0E9DF" },
  offwhite: { label: "Blanc cassé", hex: "#F5F2EC" },
} as const;
export type HighlightColorKey = keyof typeof HIGHLIGHT_COLORS;

export const IMAGE_SIZES = { small: "Petite", medium: "Moyenne", full: "Pleine largeur" } as const;
export const CALLOUT_VARIANTS = { retenir: "À retenir", info: "Information", attention: "Attention" } as const;
export const TEXT_ALIGNS = ["left", "center", "right", "justify"] as const;

export const RICH_TEXT_LIMITS = {
  maxDepth: 12,
  maxNodes: 20_000,
  maxTextChars: 200_000,
  maxTextNodeChars: 20_000,
} as const;

// ---------------------------------------------------------------- types

export interface RTMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface RTNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RTNode[];
  marks?: RTMark[];
  text?: string;
}
export interface RichTextDoc extends RTNode {
  type: "doc";
  content: RTNode[];
}

export const emptyDoc = (): RichTextDoc => ({ type: "doc", content: [{ type: "paragraph" }] });

// ---------------------------------------------------------------- attribute schemas

const align = z.enum(TEXT_ALIGNS).nullable().optional();
const mediaId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

const ATTRS: Record<string, z.ZodType<Record<string, unknown>> | null> = {
  doc: null,
  text: null,
  hardBreak: null,
  bulletList: null,
  listItem: null,
  blockquote: null,
  horizontalRule: null,
  tableRow: null,
  paragraph: z.object({ textAlign: align }),
  heading: z.object({ level: z.union([z.literal(2), z.literal(3), z.literal(4)]), textAlign: align }),
  orderedList: z.object({ start: z.number().int().min(1).max(10_000).nullable().optional() }),
  callout: z.object({ variant: z.enum(["retenir", "info", "attention"]).default("retenir") }),
  image: z.object({
    mediaId,
    alt: z.string().trim().min(1, "Texte alternatif requis").max(300),
    caption: z.string().trim().max(300).nullable().optional(),
    size: z.enum(["small", "medium", "full"]).default("medium"),
  }),
  tableCell: z.object({
    colspan: z.number().int().min(1).max(10).default(1),
    rowspan: z.number().int().min(1).max(10).default(1),
    colwidth: z.array(z.number().int().min(10).max(2000)).max(10).nullable().optional(),
  }),
};
ATTRS.tableHeader = ATTRS.tableCell!;

const MARK_ATTRS: Record<string, z.ZodType<Record<string, unknown>> | null> = {
  bold: null,
  italic: null,
  underline: null,
  strike: null,
  subscript: null,
  superscript: null,
  link: z.object({
    href: z
      .string()
      .trim()
      .max(2048)
      .refine((h) => isSafeHref(h, { allowHttp: true }), "Lien non autorisé"),
    nofollow: z.boolean().default(false),
    target: z.enum(["_blank", "_self"]).nullable().optional(),
  }),
  textStyle: z.object({
    fontSize: z.enum(["sm", "base", "lg", "xl"]).nullable().optional(),
    color: z.enum(["charcoal", "graphite", "bronze"]).nullable().optional(),
  }),
  highlight: z.object({ color: z.enum(["beige", "sand", "offwhite"]).default("beige") }),
};

/** Attribute keys tolerated (and dropped) when null — Tiptap serializes some defaults. */
const DROPPABLE_IF_NULL = new Set(["class", "id", "title", "dir"]);
/** Keys that are recomputed by the renderer and silently dropped. */
const IGNORED_MARK_KEYS: Record<string, Set<string>> = { link: new Set(["rel", "class"]) };

// ---------------------------------------------------------------- content model

const INLINE = new Set(["text", "hardBreak"]);
const LIST = new Set(["bulletList", "orderedList"]);
const SIMPLE_BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList"]);
const TOP_BLOCKS = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "horizontalRule",
  "callout",
  "image",
  "table",
]);

/** Allowed children per node type (undefined => leaf, no content allowed). */
const CHILDREN: Record<string, Set<string> | undefined> = {
  doc: TOP_BLOCKS,
  paragraph: INLINE,
  heading: INLINE,
  bulletList: new Set(["listItem"]),
  orderedList: new Set(["listItem"]),
  listItem: new Set(["paragraph", ...LIST]),
  blockquote: SIMPLE_BLOCKS,
  callout: SIMPLE_BLOCKS,
  table: new Set(["tableRow"]),
  tableRow: new Set(["tableCell", "tableHeader"]),
  tableCell: new Set(["paragraph"]),
  tableHeader: new Set(["paragraph"]),
  text: undefined,
  hardBreak: undefined,
  horizontalRule: undefined,
  image: undefined,
};
/** Nodes that must have at least one child. */
const NON_EMPTY = new Set(["bulletList", "orderedList", "listItem", "table", "tableRow", "tableCell", "tableHeader"]);

// ---------------------------------------------------------------- validation

export interface RichTextIssue {
  path: string;
  message: string;
}

export type RichTextResult = { ok: true; doc: RichTextDoc } | { ok: false; errors: RichTextIssue[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function cleanAttrs(
  raw: unknown,
  schema: z.ZodType<Record<string, unknown>> | null,
  path: string,
  errors: RichTextIssue[],
  ignored?: Set<string>,
): Record<string, unknown> | undefined {
  if (raw !== undefined && raw !== null && !isPlainObject(raw)) {
    errors.push({ path, message: "attrs invalides" });
    return undefined;
  }
  const input: Record<string, unknown> = {};
  const known = schema instanceof z.ZodObject ? new Set(Object.keys(schema.shape)) : new Set<string>();
  for (const [k, v] of Object.entries((raw as Record<string, unknown> | undefined) ?? {})) {
    if (known.has(k)) input[k] = v;
    else if (ignored?.has(k)) continue;
    else if (v === null || v === undefined || (DROPPABLE_IF_NULL.has(k) && v === "")) continue;
    else errors.push({ path: `${path}.${k}`, message: `attribut non autorisé « ${k} »` });
  }
  if (!schema) return undefined;
  const res = schema.safeParse(input);
  if (!res.success) {
    for (const i of res.error.issues) errors.push({ path: `${path}.${i.path.join(".")}`, message: i.message });
    return undefined;
  }
  // drop null / undefined values for a compact normalized doc
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(res.data)) if (v !== null && v !== undefined) out[k] = v;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Validates and normalizes a Tiptap JSON document. Never throws.
 * Rejects unknown nodes/marks/attributes, unsafe links, invalid nesting and
 * oversize documents.
 */
export function validateRichText(input: unknown): RichTextResult {
  const errors: RichTextIssue[] = [];
  let nodes = 0;
  let chars = 0;

  function walk(raw: unknown, path: string, depth: number, allowed: Set<string>): RTNode | null {
    if (errors.length > 50) return null;
    if (!isPlainObject(raw) || typeof raw.type !== "string") {
      errors.push({ path, message: "nœud invalide" });
      return null;
    }
    const type = raw.type;
    if (!(type in CHILDREN) || type === "doc") {
      errors.push({ path, message: `type de nœud non autorisé « ${type.slice(0, 40)} »` });
      return null;
    }
    if (!allowed.has(type)) {
      errors.push({ path, message: `« ${type} » n’est pas autorisé ici` });
      return null;
    }
    if (++nodes > RICH_TEXT_LIMITS.maxNodes) {
      errors.push({ path, message: "document trop volumineux" });
      return null;
    }
    if (depth > RICH_TEXT_LIMITS.maxDepth) {
      errors.push({ path, message: "imbrication trop profonde" });
      return null;
    }
    for (const k of Object.keys(raw)) {
      if (!["type", "attrs", "content", "marks", "text"].includes(k)) {
        errors.push({ path: `${path}.${k}`, message: `propriété non autorisée « ${k.slice(0, 40)} »` });
      }
    }

    const node: RTNode = { type };
    const attrs = cleanAttrs(raw.attrs, ATTRS[type] ?? null, `${path}.attrs`, errors);
    if (attrs) node.attrs = attrs;

    if (type === "text") {
      if (typeof raw.text !== "string" || raw.text.length === 0) {
        errors.push({ path, message: "texte vide" });
        return null;
      }
      if (raw.text.length > RICH_TEXT_LIMITS.maxTextNodeChars) errors.push({ path, message: "texte trop long" });
      chars += raw.text.length;
      node.text = raw.text;
      if (raw.marks !== undefined) {
        if (!Array.isArray(raw.marks) || raw.marks.length > 10) {
          errors.push({ path: `${path}.marks`, message: "marques invalides" });
        } else {
          const seen = new Set<string>();
          const marks: RTMark[] = [];
          raw.marks.forEach((m: unknown, i: number) => {
            const mp = `${path}.marks[${i}]`;
            if (!isPlainObject(m) || typeof m.type !== "string" || !(m.type in MARK_ATTRS)) {
              errors.push({ path: mp, message: `marque non autorisée « ${String((m as RTMark)?.type).slice(0, 40)} »` });
              return;
            }
            for (const k of Object.keys(m)) {
              if (k !== "type" && k !== "attrs") errors.push({ path: `${mp}.${k}`, message: "propriété non autorisée" });
            }
            if (seen.has(m.type)) return;
            seen.add(m.type);
            const mAttrs = cleanAttrs(m.attrs, MARK_ATTRS[m.type] ?? null, `${mp}.attrs`, errors, IGNORED_MARK_KEYS[m.type]);
            if (m.type === "textStyle" && !mAttrs) return; // empty textStyle is a no-op
            marks.push(mAttrs ? { type: m.type, attrs: mAttrs } : { type: m.type });
          });
          if (marks.length) node.marks = marks;
        }
      }
      return node;
    }
    if (raw.text !== undefined) errors.push({ path: `${path}.text`, message: "texte non autorisé sur ce nœud" });
    if (raw.marks !== undefined) errors.push({ path: `${path}.marks`, message: "marques non autorisées sur ce nœud" });

    const childTypes = CHILDREN[type];
    if (raw.content !== undefined && raw.content !== null) {
      if (!childTypes) {
        errors.push({ path: `${path}.content`, message: `« ${type} » ne peut pas contenir d’autres nœuds` });
      } else if (!Array.isArray(raw.content)) {
        errors.push({ path: `${path}.content`, message: "content doit être un tableau" });
      } else {
        const children = raw.content
          .map((c: unknown, i: number) => walk(c, `${path}.content[${i}]`, depth + 1, childTypes))
          .filter((c): c is RTNode => c !== null);
        if (children.length) node.content = children;
      }
    }
    if (NON_EMPTY.has(type) && !node.content?.length) errors.push({ path, message: `« ${type} » ne peut pas être vide` });
    return node;
  }

  if (!isPlainObject(input) || input.type !== "doc") {
    return { ok: false, errors: [{ path: "doc", message: "document Tiptap attendu (type « doc »)" }] };
  }
  for (const k of Object.keys(input)) {
    if (k !== "type" && k !== "content" && k !== "attrs") errors.push({ path: `doc.${k}`, message: "propriété non autorisée" });
  }
  const rawContent = input.content ?? [];
  if (!Array.isArray(rawContent)) return { ok: false, errors: [{ path: "doc.content", message: "content doit être un tableau" }] };
  const content = rawContent
    .map((c: unknown, i: number) => walk(c, `doc.content[${i}]`, 1, TOP_BLOCKS))
    .filter((c): c is RTNode => c !== null);
  if (chars > RICH_TEXT_LIMITS.maxTextChars) errors.push({ path: "doc", message: "texte trop long" });
  if (errors.length) return { ok: false, errors: errors.slice(0, 50) };
  return { ok: true, doc: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] } };
}

/** Zod schema wrapper (for embedding in other schemas). Output is the normalized doc. */
export const RichTextDocSchema = z.unknown().transform((v, ctx): RichTextDoc => {
  const res = validateRichText(v);
  if (!res.ok) {
    for (const e of res.errors) ctx.addIssue({ code: "custom", message: `${e.path}: ${e.message}` });
    return z.NEVER;
  }
  return res.doc;
});

/** Lenient read for rendering: invalid docs render as empty (never throws). */
export function parseRichText(input: unknown): RichTextDoc {
  const res = validateRichText(input);
  return res.ok ? res.doc : emptyDoc();
}

// ---------------------------------------------------------------- helpers

const BLOCK_SEPARATED = new Set(["paragraph", "heading", "listItem", "blockquote", "callout", "tableRow", "horizontalRule", "image"]);

/** Plain text (for excerpts, meta descriptions, search, reading time). */
export function richTextToPlainText(doc: unknown): string {
  const out: string[] = [];
  const walk = (n: unknown) => {
    if (!isPlainObject(n)) return;
    if (n.type === "text" && typeof n.text === "string") out.push(n.text);
    else if (n.type === "hardBreak") out.push("\n");
    else if (n.type === "tableCell" || n.type === "tableHeader") out.push(" ");
    if (Array.isArray(n.content)) n.content.forEach(walk);
    if (typeof n.type === "string" && BLOCK_SEPARATED.has(n.type)) out.push("\n");
  };
  walk(doc);
  return out
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/** Estimated reading time in minutes (220 words/min, minimum 1). */
export function estimateReadingMinutes(doc: unknown, wordsPerMinute = 220): number {
  return Math.max(1, Math.round(countWords(richTextToPlainText(doc)) / wordsPerMinute));
}

/** Truncated plain-text excerpt at a word boundary. */
export function richTextExcerpt(doc: unknown, maxChars = 160): string {
  const text = richTextToPlainText(doc).replace(/\n+/g, " ");
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/** Media ids referenced by image nodes. */
export function collectRichTextMediaIds(doc: unknown): string[] {
  const ids = new Set<string>();
  const walk = (n: unknown) => {
    if (!isPlainObject(n)) return;
    if (n.type === "image" && isPlainObject(n.attrs) && typeof n.attrs.mediaId === "string") ids.add(n.attrs.mediaId);
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return [...ids];
}

/** rel attribute the renderer must use for a link mark. */
export function linkRel(attrs: { href: string; nofollow?: boolean }): string | undefined {
  const external = /^https?:/i.test(attrs.href);
  const parts = external ? ["noopener", "noreferrer"] : [];
  if (attrs.nofollow) parts.push("nofollow");
  return parts.length ? parts.join(" ") : undefined;
}
