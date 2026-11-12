import "server-only";
import sharp, { type Metadata } from "sharp";
import { PUBLIC_IMAGE_MIME, MAX_MEDIA_UPLOAD_BYTES, sniffMime } from "@/lib/storage/mime";

/**
 * Image pipeline (owner: cms-admin). Pure: bytes in, re-encoded bytes out.
 *  1. never trust name / client MIME: magic bytes decide (SVG, GIF, HTML, PDF refused);
 *  2. size + pixel limits BEFORE decoding to a full bitmap (`limitInputPixels`);
 *  3. everything is decoded and re-encoded by sharp: trailing/polyglot payloads,
 *     EXIF/GPS/XMP/IPTC and embedded scripts are dropped, `.rotate()` bakes EXIF orientation in;
 *  4. output = a "master" WebP (<= 2400 px) + AVIF/WebP variants (480/800/1200/1600/2400 capped to source).
 */
export const MAX_PIXELS = 40_000_000; // 40 MP
export const MAX_DIMENSION = 16_000;
export const MIN_DIMENSION = 16;
export const MASTER_MAX_WIDTH = 2400;
export const VARIANT_WIDTHS = [480, 800, 1200, 1600, 2400] as const;

export type VariantFormat = "avif" | "webp" | "jpeg";
export interface MediaVariant {
  key: string;
  width: number;
  height: number;
  format: VariantFormat;
}

export class MediaError extends Error {
  constructor(
    message: string,
    public readonly code: "empty" | "too_large" | "bad_type" | "mismatch" | "bad_image" | "too_many_pixels" | "animated" | "in_use" | "not_found" | "invalid",
  ) {
    super(message);
    this.name = "MediaError";
  }
}

export interface EncodedImage {
  width: number;
  height: number;
  data: Buffer;
}
export interface EncodedVariant extends EncodedImage {
  format: "avif" | "webp";
}
export interface ImageSet {
  master: EncodedImage; // WebP, largest web-optimised version
  variants: EncodedVariant[];
  sourceMime: string;
}

const FORMAT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "heif",
};

/** Validates the upload and returns the sniffed MIME. Throws MediaError. */
export async function inspectUpload(buffer: Uint8Array, declaredMime?: string | null): Promise<string> {
  if (!buffer || buffer.byteLength === 0) throw new MediaError("Le fichier est vide.", "empty");
  if (buffer.byteLength > MAX_MEDIA_UPLOAD_BYTES) throw new MediaError("Fichier trop volumineux (15 Mo maximum).", "too_large");
  const mime = sniffMime(buffer);
  if (!mime || !(PUBLIC_IMAGE_MIME as readonly string[]).includes(mime)) {
    throw new MediaError("Format non accepté : seuls JPEG, PNG, WebP et AVIF sont autorisés (ni SVG, ni GIF, ni HTML).", "bad_type");
  }
  if (declaredMime && declaredMime !== "application/octet-stream" && declaredMime !== mime) {
    throw new MediaError("Le type annoncé du fichier ne correspond pas à son contenu réel.", "mismatch");
  }
  let meta: Metadata;
  try {
    meta = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (/pixel limit/i.test(msg)) throw new MediaError("Image trop grande (40 mégapixels maximum).", "too_many_pixels");
    throw new MediaError("Image illisible ou corrompue.", "bad_image");
  }
  if (meta.format !== FORMAT_BY_MIME[mime]) throw new MediaError("Le contenu du fichier ne correspond pas à son format.", "mismatch");
  if ((meta.pages ?? 1) > 1) throw new MediaError("Les images animées ne sont pas acceptées.", "animated");
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < MIN_DIMENSION || h < MIN_DIMENSION) throw new MediaError(`Image trop petite (minimum ${MIN_DIMENSION} px).`, "bad_image");
  if (w > MAX_DIMENSION || h > MAX_DIMENSION || w * h > MAX_PIXELS) {
    throw new MediaError("Image trop grande (40 mégapixels / 16 000 px maximum).", "too_many_pixels");
  }
  return mime;
}

/** Re-encodes (strips metadata, auto-orients) and builds the responsive set. */
export async function encodeImageSet(buffer: Uint8Array, declaredMime?: string | null): Promise<ImageSet> {
  const sourceMime = await inspectUpload(buffer, declaredMime);
  return encodeValidated(buffer, sourceMime);
}

async function encodeValidated(buffer: Uint8Array, sourceMime: string): Promise<ImageSet> {
  try {
    const { data, info } = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: "error" })
      .rotate() // bake EXIF orientation; metadata is NOT carried over (no withMetadata)
      .resize({ width: MASTER_MAX_WIDTH, height: MASTER_MAX_WIDTH, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const master: EncodedImage = { data, width: info.width, height: info.height };
    return { master, variants: await buildVariants(master), sourceMime };
  } catch (err) {
    if (err instanceof MediaError) throw err;
    throw new MediaError("Impossible de traiter cette image.", "bad_image");
  }
}

async function buildVariants(master: EncodedImage): Promise<EncodedVariant[]> {
  const widths = new Set<number>(VARIANT_WIDTHS.filter((w) => w < master.width));
  widths.add(master.width);
  const out: EncodedVariant[] = [];
  for (const w of [...widths].sort((a, b) => a - b)) {
    const base = () => sharp(master.data).resize({ width: w, withoutEnlargement: true });
    if (w === master.width) {
      out.push({ format: "webp", width: master.width, height: master.height, data: master.data });
    } else {
      const r = await base().webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
      out.push({ format: "webp", width: r.info.width, height: r.info.height, data: r.data });
    }
    const a = await base().avif({ quality: 55, effort: 3 }).toBuffer({ resolveWithObject: true });
    out.push({ format: "avif", width: a.info.width, height: a.info.height, data: a.data });
  }
  return out;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Crops an already-sanitised master (WebP) and rebuilds the set. `unit` relative = fractions 0..1 of the master. */
export async function cropImageSet(masterBytes: Uint8Array, rect: CropRect, unit: "pixels" | "relative"): Promise<ImageSet & { rectPx: CropRect }> {
  const meta = await sharp(masterBytes).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  const k = unit === "relative" ? { x: W, y: H } : { x: 1, y: 1 };
  const left = Math.round(rect.x * k.x);
  const top = Math.round(rect.y * k.y);
  const width = Math.round(rect.width * k.x);
  const height = Math.round(rect.height * k.y);
  if (![left, top, width, height].every(Number.isFinite) || left < 0 || top < 0 || width < MIN_DIMENSION || height < MIN_DIMENSION || left + width > W + 1 || top + height > H + 1) {
    throw new MediaError("Zone de recadrage invalide.", "invalid");
  }
  const rectPx = { x: left, y: top, width: Math.min(width, W - left), height: Math.min(height, H - top) };
  const cropped = await sharp(masterBytes)
    .extract({ left: rectPx.x, top: rectPx.y, width: rectPx.width, height: rectPx.height })
    .png()
    .toBuffer();
  const set = await encodeValidated(cropped, "image/png");
  return { ...set, rectPx };
}
