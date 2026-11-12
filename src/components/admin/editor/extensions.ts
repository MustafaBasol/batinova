"use client";
// Tiptap configuration that maps EXACTLY onto src/lib/richtext/schema.ts (owner: cms-admin).
// Anything not listed here cannot exist in the editor; the server re-validates with validateRichText().
import { Node, mergeAttributes } from "@tiptap/core";
import { Blockquote } from "@tiptap/extension-blockquote";
import Highlight from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { isSafeHref } from "@/lib/security/href";


/** Safe subset of the Link mark: href, target, nofollow (rel/class are recomputed by the public renderer). */
export const BrandLink = Link.extend({
  addAttributes() {
    return {
      href: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("href"), renderHTML: (a: Record<string, unknown>) => (a.href ? { href: a.href } : {}) },
      target: {
        default: null,
        parseHTML: (el: HTMLElement) => (el.getAttribute("target") === "_blank" ? "_blank" : null),
        renderHTML: (a: Record<string, unknown>) => (a.target === "_blank" ? { target: "_blank", rel: `noopener noreferrer${a.nofollow ? " nofollow" : ""}` } : a.nofollow ? { rel: "nofollow" } : {}),
      },
      nofollow: { default: false, parseHTML: (el: HTMLElement) => /nofollow/.test(el.getAttribute("rel") ?? ""), renderHTML: () => ({}) },
    };
  },
}).configure({
  openOnClick: false,
  autolink: true,
  linkOnPaste: true,
  defaultProtocol: "https",
  protocols: ["mailto", "tel"],
  isAllowedUri: (url: string) => isSafeHref(url, { allowHttp: true }),
});

/** textStyle mark restricted to preset size + brand colour keys. */
export const BrandTextStyle = TextStyle.extend({
  addAttributes() {
    return {
      fontSize: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute("data-fs");
          return v && ["sm", "base", "lg", "xl"].includes(v) ? v : null;
        },
        renderHTML: (a: Record<string, unknown>) => (a.fontSize ? { "data-fs": a.fontSize } : {}),
      },
      color: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute("data-color");
          return v && ["charcoal", "graphite", "bronze"].includes(v) ? v : null;
        },
        renderHTML: (a: Record<string, unknown>) => (a.color ? { "data-color": a.color } : {}),
      },
    };
  },
});

export const BrandHighlight = Highlight.extend({
  addAttributes() {
    return {
      color: {
        default: "beige",
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute("data-hl");
          return v && ["beige", "sand", "offwhite"].includes(v) ? v : "beige";
        },
        renderHTML: (a: Record<string, unknown>) => ({ "data-hl": a.color ?? "beige" }),
      },
    };
  },
}).configure({ multicolor: true });

/** Blockquote may only contain simple blocks (matches the server whitelist). */
export const BrandBlockquote = Blockquote.extend({ content: "(paragraph|heading|bulletList|orderedList)+" });

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "(paragraph|heading|bulletList|orderedList)+",
  defining: true,
  addAttributes() {
    return {
      variant: {
        default: "retenir",
        parseHTML: (el: HTMLElement) => {
          const v = el.getAttribute("data-callout");
          return v && ["retenir", "info", "attention"].includes(v) ? v : "retenir";
        },
        renderHTML: (a: Record<string, unknown>) => ({ "data-callout": a.variant }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },
});

const TABLE_CELL_CONTENT = "paragraph+";
export const BrandTableCell = TableCell.extend({ content: TABLE_CELL_CONTENT });
export const BrandTableHeader = TableHeader.extend({ content: TABLE_CELL_CONTENT });

export function createImageNode(resolveUrl: (mediaId: string) => string | null) {
  return Node.create({
    name: "image",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        mediaId: { default: null, parseHTML: (el: HTMLElement) => el.getAttribute("data-media-id") },
        alt: { default: "", parseHTML: (el: HTMLElement) => el.querySelector("img")?.getAttribute("alt") ?? "" },
        caption: { default: null, parseHTML: (el: HTMLElement) => el.querySelector("figcaption")?.textContent || null },
        size: {
          default: "medium",
          parseHTML: (el: HTMLElement) => {
            const v = el.getAttribute("data-size");
            return v && ["small", "medium", "full"].includes(v) ? v : "medium";
          },
        },
      };
    },
    parseHTML() {
      return [{ tag: "figure[data-media-id]" }];
    },
    renderHTML({ node }) {
      const url = node.attrs.mediaId ? resolveUrl(String(node.attrs.mediaId)) : null;
      const children: unknown[] = [["img", { src: url ?? "", alt: String(node.attrs.alt ?? "") }]];
      if (node.attrs.caption) children.push(["figcaption", {}, String(node.attrs.caption)]);
      return ["figure", { "data-media-id": String(node.attrs.mediaId ?? ""), "data-size": String(node.attrs.size ?? "medium") }, ...children] as never;
    },
  });
}

export function buildExtensions(resolveUrl: (mediaId: string) => string | null) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      blockquote: false,
      code: false,
      codeBlock: false,
      link: false,
    }),
    BrandBlockquote,
    BrandLink,
    BrandTextStyle,
    BrandHighlight,
    Subscript,
    Superscript,
    TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
    Callout,
    createImageNode(resolveUrl),
    Table.configure({ resizable: false }),
    TableRow,
    BrandTableHeader,
    BrandTableCell,
  ];
}
