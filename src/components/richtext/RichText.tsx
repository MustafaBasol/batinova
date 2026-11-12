/**
 * Server renderer for the whitelisted Tiptap document (src/lib/richtext/schema.ts). STABLE CONTRACT.
 *
 * <RichText doc media className? />
 *   doc   : RichTextDoc | unknown (re-validated leniently via parseRichText; invalid => renders nothing)
 *   media : Record<mediaId, MediaLike> for `image` nodes (missing media => node skipped)
 *
 * Maps nodes/marks to React elements + preset CSS classes (see `.prose-bn`, `.rt-*` in globals.css).
 * Never uses dangerouslySetInnerHTML; unknown nodes/marks are skipped; links get `linkRel()`.
 * Headings are 2-4 (the page/article H1 is rendered by the surrounding view).
 */
import { Fragment, type ReactNode } from "react";
import { CALLOUT_VARIANTS, linkRel, parseRichText, type RTMark, type RTNode } from "@/lib/richtext/schema";
import { ResponsiveImage, type MediaLike } from "@/components/media/ResponsiveImage";

type MediaMap = Record<string, MediaLike>;

const ALIGN: Record<string, string> = {
  left: "rt-align-left",
  center: "rt-align-center",
  right: "rt-align-right",
  justify: "rt-align-justify",
};
const SIZE_CLASS: Record<string, string> = { sm: "rt-size-sm", lg: "rt-size-lg", xl: "rt-size-xl" };
const IMG_SIZE_CLASS: Record<string, string> = { small: "rt-img-small", medium: "rt-img-medium", full: "rt-img-full" };
const IMG_SIZES_ATTR: Record<string, string> = {
  small: "(min-width: 640px) 288px, 90vw",
  medium: "(min-width: 768px) 512px, 92vw",
  full: "(min-width: 1024px) 704px, 92vw",
};

function alignClass(node: RTNode): string | undefined {
  const a = node.attrs?.textAlign;
  return typeof a === "string" ? ALIGN[a] : undefined;
}

function applyMarks(text: string, marks: RTMark[] | undefined, key: string): ReactNode {
  let el: ReactNode = text;
  const classes: string[] = [];
  for (const m of marks ?? []) {
    const a = m.attrs ?? {};
    switch (m.type) {
      case "bold":
        el = <strong>{el}</strong>;
        break;
      case "italic":
        el = <em>{el}</em>;
        break;
      case "underline":
        el = <u>{el}</u>;
        break;
      case "strike":
        el = <s>{el}</s>;
        break;
      case "subscript":
        el = <sub>{el}</sub>;
        break;
      case "superscript":
        el = <sup>{el}</sup>;
        break;
      case "textStyle":
        if (typeof a.fontSize === "string" && SIZE_CLASS[a.fontSize]) classes.push(SIZE_CLASS[a.fontSize]!);
        if (typeof a.color === "string" && ["charcoal", "graphite", "bronze"].includes(a.color)) classes.push(`rt-color-${a.color}`);
        break;
      case "highlight": {
        const c = typeof a.color === "string" && ["beige", "sand", "offwhite"].includes(a.color) ? a.color : "beige";
        classes.push(`rt-hl-${c}`);
        break;
      }
      case "link": {
        const href = typeof a.href === "string" ? a.href : null;
        if (!href) break;
        const external = /^https?:/i.test(href);
        const blank = a.target === "_blank";
        const rel = linkRel({ href, nofollow: a.nofollow === true });
        el = (
          <a
            href={href}
            rel={blank && !rel ? "noopener noreferrer" : rel}
            target={blank ? "_blank" : undefined}
          >
            {el}
            {external || blank ? <span className="sr-only"> (s’ouvre dans un nouvel onglet ou un site externe)</span> : null}
          </a>
        );
        break;
      }
      default:
        break; // unknown mark: skipped
    }
  }
  if (classes.length) el = <span className={classes.join(" ")}>{el}</span>;
  return <Fragment key={key}>{el}</Fragment>;
}

function renderChildren(nodes: RTNode[] | undefined, media: MediaMap, path: string): ReactNode[] {
  return (nodes ?? []).map((n, i) => renderNode(n, media, `${path}.${i}`));
}

function renderNode(node: RTNode, media: MediaMap, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks, key);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph": {
      if (!node.content?.length) return null;
      return (
        <p key={key} className={alignClass(node)}>
          {renderChildren(node.content, media, key)}
        </p>
      );
    }
    case "heading": {
      const level = node.attrs?.level;
      const kids = renderChildren(node.content, media, key);
      const cls = alignClass(node);
      if (level === 3) return <h3 key={key} className={cls}>{kids}</h3>;
      if (level === 4) return <h4 key={key} className={cls}>{kids}</h4>;
      return <h2 key={key} className={cls}>{kids}</h2>;
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node.content, media, key)}</ul>;
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : undefined;
      return <ol key={key} start={start}>{renderChildren(node.content, media, key)}</ol>;
    }
    case "listItem":
      return <li key={key}>{renderChildren(node.content, media, key)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node.content, media, key)}</blockquote>;
    case "horizontalRule":
      return <hr key={key} />;
    case "callout": {
      const v = typeof node.attrs?.variant === "string" && node.attrs.variant in CALLOUT_VARIANTS ? node.attrs.variant : "retenir";
      const label = CALLOUT_VARIANTS[v as keyof typeof CALLOUT_VARIANTS];
      return (
        <aside key={key} className={`rt-callout ${v === "info" ? "rt-callout-info" : v === "attention" ? "rt-callout-attention" : ""}`} aria-label={label}>
          <span className="rt-callout-title">{label}</span>
          {renderChildren(node.content, media, key)}
        </aside>
      );
    }
    case "image": {
      const id = typeof node.attrs?.mediaId === "string" ? node.attrs.mediaId : "";
      const m = media[id];
      if (!m) return null;
      const size = typeof node.attrs?.size === "string" && node.attrs.size in IMG_SIZE_CLASS ? node.attrs.size : "medium";
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : (m.alt ?? "");
      const caption = typeof node.attrs?.caption === "string" ? node.attrs.caption : null;
      return (
        <figure key={key} className={`${IMG_SIZE_CLASS[size]}`}>
          <ResponsiveImage media={m} alt={alt} sizes={IMG_SIZES_ATTR[size]} />
          {caption || m.isPlaceholder ? (
            <figcaption>
              {caption}
              {m.isPlaceholder ? `${caption ? " — " : ""}Illustration` : ""}
              {m.credit ? ` · ${m.credit}` : ""}
            </figcaption>
          ) : null}
        </figure>
      );
    }
    case "table": {
      const rows = node.content ?? [];
      return (
        <div key={key} className="table-scroll" tabIndex={0} role="region" aria-label="Tableau défilant">
          <table>
            <tbody>{renderChildren(rows, media, key)}</tbody>
          </table>
        </div>
      );
    }
    case "tableRow":
      return <tr key={key}>{renderChildren(node.content, media, key)}</tr>;
    case "tableHeader":
    case "tableCell": {
      const Tag = node.type === "tableHeader" ? "th" : "td";
      const colSpan = typeof node.attrs?.colspan === "number" && node.attrs.colspan > 1 ? node.attrs.colspan : undefined;
      const rowSpan = typeof node.attrs?.rowspan === "number" && node.attrs.rowspan > 1 ? node.attrs.rowspan : undefined;
      return (
        <Tag key={key} colSpan={colSpan} rowSpan={rowSpan} scope={node.type === "tableHeader" ? "col" : undefined}>
          {renderChildren(node.content, media, key)}
        </Tag>
      );
    }
    default:
      return null; // unknown node: skipped
  }
}

export function RichText({ doc, media = {}, className = "" }: { doc: unknown; media?: MediaMap; className?: string }) {
  const parsed = parseRichText(doc);
  return <div className={`prose-bn ${className}`}>{renderChildren(parsed.content, media, "n")}</div>;
}
