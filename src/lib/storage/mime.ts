/**
 * MIME policy & magic-byte sniffing (owner: architect-security).
 * Never trust the client-supplied Content-Type or extension: sniff the bytes.
 * SVG is intentionally NOT accepted (script vector).
 */
export const PUBLIC_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type PublicImageMime = (typeof PUBLIC_IMAGE_MIME)[number];

/** Lead attachments (private): images + PDF only. */
export const ATTACHMENT_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIME)[number];

export const MAX_MEDIA_UPLOAD_BYTES = 15 * 1024 * 1024; // before re-encoding
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_LEAD = 4;

export const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  pdf: "application/pdf",
};

export function mimeFromKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

export function isRasterImageMime(mime: string): boolean {
  return (PUBLIC_IMAGE_MIME as readonly string[]).includes(mime);
}

/** Detects the real type from the first bytes; null when unknown/unsupported. */
export function sniffMime(buf: Uint8Array): string | null {
  const b = (i: number) => buf[i] ?? -1;
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a)
    return "image/png";
  const ascii = (s: number, e: number) => String.fromCharCode(...Array.from(buf.subarray(s, e)));
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (buf.length >= 12 && ascii(4, 8) === "ftyp" && /^(avif|avis)$/.test(ascii(8, 12))) return "image/avif";
  if (buf.length >= 5 && ascii(0, 5) === "%PDF-") return "application/pdf";
  return null;
}
