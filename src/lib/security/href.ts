/**
 * Safe link validation shared by CMS blocks, navigation and redirects
 * (owner: architect-security). Isomorphic (no server-only imports).
 *
 * Allowed:
 *  - relative paths starting with a single "/" (e.g. "/contact", "/blog?page=2", "/#devis")
 *  - in-page anchors "#section"
 *  - absolute https:// URLs (and http:// only when opts.allowHttp, e.g. rich-text links)
 *  - mailto: and tel:
 * Rejected: javascript:, data:, vbscript:, http:, protocol-relative "//host",
 * backslashes, control characters and whitespace tricks.
 */
// Control characters, spaces, DEL/C1 controls and Unicode line/paragraph separators.
const CONTROL_OR_SPACE = new RegExp("[\x00-\x20\x7f-\x9f" + String.fromCharCode(0x2028, 0x2029) + "]");

export function isSafeHref(raw: string, opts: { allowHttp?: boolean } = {}): boolean {
  if (typeof raw !== "string") return false;
  const href = raw.trim();
  if (href.length === 0 || href.length > 2048) return false;
  if (CONTROL_OR_SPACE.test(href) || href.includes("\\")) return false;

  if (href.startsWith("#")) return /^#[A-Za-z0-9\-_]{1,100}$/.test(href);
  if (href.startsWith("/")) return !href.startsWith("//");

  const lower = href.toLowerCase();
  if (lower.startsWith("mailto:")) {
    return /^mailto:[^\s@<>"']+@[^\s@<>"']+$/i.test(href.split("?")[0] ?? "");
  }
  if (lower.startsWith("tel:")) return /^tel:\+?[0-9 .\-()]{3,30}$/.test(href);
  if (lower.startsWith("https://") || (opts.allowHttp && lower.startsWith("http://"))) {
    try {
      const u = new URL(href);
      return (u.protocol === "https:" || (!!opts.allowHttp && u.protocol === "http:")) && u.hostname.length > 0 && !u.username && !u.password;
    } catch {
      return false;
    }
  }
  return false;
}

/** Internal path check (redirect targets, canonicalPath): "/" + safe chars, no "//". */
export function isSafeInternalPath(raw: string): boolean {
  if (typeof raw !== "string") return false;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.length > 512) return false;
  if (CONTROL_OR_SPACE.test(raw) || raw.includes("\\")) return false;
  return /^\/[A-Za-z0-9\-._~/%?=&#]*$/.test(raw);
}

export function isExternalHref(href: string): boolean {
  return href.toLowerCase().startsWith("https://") || href.toLowerCase().startsWith("http://");
}
