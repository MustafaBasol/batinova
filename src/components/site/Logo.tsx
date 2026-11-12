/**
 * The ONLY component rendering the logo (header, mobile menu, footer…). Files come from ./brand-assets.ts.
 * <Logo variant="color" | "mono" | "onDark" className? priority? />
 * Display size is set through className (e.g. "w-[10.5rem]"); height follows the intrinsic ratio
 * (explicit width/height attributes + h-auto => never cropped or stretched).
 */
import { LOGOS, LOGO_ALT, type LogoOverrides, type LogoVariant } from "./brand-assets";

const toSet = (l: { src: string; width: number }[]) => l.map((x) => `${x.src} ${x.width}w`).join(", ");

export function Logo({
  variant = "color",
  className = "w-[10.5rem]",
  priority = false,
  overrides,
}: {
  variant?: LogoVariant;
  className?: string;
  priority?: boolean;
  /** Admin logo overrides resolved server-side (resolveLogoOverrides) and passed down as props. */
  overrides?: LogoOverrides;
}) {
  const o = overrides?.[variant];
  if (o) {
    return (
      <picture>
        {o.avif.length > 0 && <source type="image/avif" srcSet={toSet(o.avif)} sizes="(min-width: 1024px) 200px, 160px" />}
        {o.webp.length > 0 && <source type="image/webp" srcSet={toSet(o.webp)} sizes="(min-width: 1024px) 200px, 160px" />}
        <img
          src={o.src}
          alt={LOGO_ALT}
          width={o.width}
          height={o.height}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={priority ? "high" : undefined}
          className={`h-auto max-w-full ${className}`}
        />
      </picture>
    );
  }
  const f = LOGOS[variant];
  return (
    <picture>
      <source type="image/webp" srcSet={`${f.webpSmall.src} ${f.webpSmall.width}w, ${f.webp.src} ${f.webp.width}w`} sizes="(min-width: 1024px) 200px, 160px" />
      <img
        src={f.png.src}
        alt={LOGO_ALT}
        width={f.png.width}
        height={f.png.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        className={`h-auto max-w-full ${className}`}
      />
    </picture>
  );
}
