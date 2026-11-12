/**
 * Responsive media rendering (design-frontend). STABLE PROP CONTRACTS — also used by the admin preview.
 *
 * MediaLike: any Media row (PublicMedia works as is). `variants` follows the cms-admin pipeline contract:
 *   Array<{ key: string; width: number; height: number; format: "avif" | "webp" | "jpeg" }>
 * served at `/media/<key>`. `storageKey` is the largest web-optimised version (fallback <img src>).
 *
 * <ResponsiveImage media sizes? priority? alt? className? />
 *   - <picture> with avif/webp srcsets, explicit width/height, lazy by default,
 *     `priority` => eager + fetchpriority="high" (LCP hero only), alt from media.alt (override with `alt`;
 *     pass alt="" for purely decorative use), object-position from focalX/focalY.
 * <MediaFrame media ... ratio? label? />
 *   - ResponsiveImage inside a cropped frame (CSS aspect ratio) with the « Illustration » badge when
 *     media.isPlaceholder (images of unverified work are never shown as real projects).
 * <PlaceholderBadge />  « Contenu de démonstration » / « Illustration » pill.
 */
import { mediaUrl } from "@/lib/content/paths";

export interface MediaVariant {
  key: string;
  width: number;
  height: number;
  format: "avif" | "webp" | "jpeg";
}

export interface MediaLike {
  id?: string;
  storageKey: string;
  mime?: string | null;
  width?: number | null;
  height?: number | null;
  alt?: string | null;
  caption?: string | null;
  credit?: string | null;
  isPlaceholder?: boolean;
  focalX?: number | null;
  focalY?: number | null;
  variants?: unknown;
}

export function parseVariants(raw: unknown): MediaVariant[] {
  if (!Array.isArray(raw)) return [];
  const out: MediaVariant[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const r = v as Record<string, unknown>;
    const key = typeof r.key === "string" ? r.key : null;
    const width = typeof r.width === "number" ? r.width : null;
    if (!key || !width) continue;
    const height = typeof r.height === "number" ? r.height : 0;
    let format: string | null = typeof r.format === "string" ? r.format : null;
    if (!format && typeof r.mime === "string") format = r.mime.replace("image/", "");
    if (!format) format = key.split(".").pop() ?? null;
    if (format === "jpg") format = "jpeg";
    if (format !== "avif" && format !== "webp" && format !== "jpeg") continue;
    out.push({ key, width, height, format });
  }
  return out;
}

const srcSet = (vs: MediaVariant[]) =>
  [...vs]
    .sort((a, b) => a.width - b.width)
    .map((v) => `${mediaUrl(v.key)} ${v.width}w`)
    .join(", ");

export function PlaceholderBadge({ label = "Contenu de démonstration", inline = false }: { label?: string; inline?: boolean }) {
  return <span className={`badge-demo ${inline ? "badge-demo-inline" : ""}`}>{label}</span>;
}

export interface ResponsiveImageProps {
  media: MediaLike;
  sizes?: string;
  priority?: boolean;
  alt?: string;
  className?: string;
}

export function ResponsiveImage({ media, sizes = "100vw", priority = false, alt, className }: ResponsiveImageProps) {
  const variants = parseVariants(media.variants);
  const avif = variants.filter((v) => v.format === "avif");
  const webp = variants.filter((v) => v.format === "webp");
  const jpeg = variants.filter((v) => v.format === "jpeg");
  const largest = [...variants].sort((a, b) => b.width - a.width)[0];
  const width = media.width ?? largest?.width ?? undefined;
  const height = media.height ?? largest?.height ?? undefined;
  const src = mediaUrl(media.storageKey);
  const objectPosition =
    media.focalX != null && media.focalY != null
      ? `${Math.round(media.focalX * 100)}% ${Math.round(media.focalY * 100)}%`
      : undefined;
  const text = alt ?? media.alt ?? "";
  return (
    <picture>
      {avif.length > 0 && <source type="image/avif" srcSet={srcSet(avif)} sizes={sizes} />}
      {webp.length > 0 && <source type="image/webp" srcSet={srcSet(webp)} sizes={sizes} />}
      <img
        src={src}
        srcSet={jpeg.length > 1 ? srcSet(jpeg) : undefined}
        sizes={jpeg.length > 1 ? sizes : undefined}
        width={width}
        height={height}
        alt={text}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : undefined}
        className={className}
        style={objectPosition ? { objectPosition } : undefined}
      />
    </picture>
  );
}

export interface MediaFrameProps extends ResponsiveImageProps {
  /** CSS aspect-ratio value, e.g. "4 / 3", "16 / 9". Default "3 / 2". */
  ratio?: string;
  /** Show the « Illustration » badge for placeholder media (default true). */
  label?: boolean;
  frameClassName?: string;
  zoom?: boolean;
}

export function MediaFrame({ media, ratio = "3 / 2", label = true, frameClassName = "", zoom = false, ...img }: MediaFrameProps) {
  return (
    <div className={`frame ${zoom ? "zoom-img" : ""} ${frameClassName}`} style={{ aspectRatio: ratio }}>
      <ResponsiveImage media={media} {...img} />
      {label && media.isPlaceholder && (
        <span className="absolute left-3 top-3">
          <PlaceholderBadge label="Illustration" />
        </span>
      )}
    </div>
  );
}
