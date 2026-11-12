/**
 * Self-hosted variable fonts (next/font/local, no network at build time).
 * Cormorant Garamond: refined high-contrast serif for editorial display type.
 * Jost: geometric sans in the spirit of the wide, geometric BatiNova lettering.
 * Both: SIL Open Font License 1.1 (Fontsource packages, latin subset: includes é è à ç œ « » ’ …).
 */
import localFont from "next/font/local";

export const cormorant = localFont({
  src: [
    { path: "../../app/fonts/cormorant-garamond-latin-wght-normal.woff2", style: "normal", weight: "300 700" },
    { path: "../../app/fonts/cormorant-garamond-latin-wght-italic.woff2", style: "italic", weight: "300 700" },
  ],
  variable: "--font-cormorant",
  display: "swap",
});

export const jost = localFont({
  src: [{ path: "../../app/fonts/jost-latin-wght-normal.woff2", style: "normal", weight: "100 900" }],
  variable: "--font-jost",
  display: "swap",
});

export const fontClassNames = `${cormorant.variable} ${jost.variable}`;
