// Shared class helpers (no "use client": usable from Server Components).
export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");

export const inputCls =
  "w-full rounded-sm border border-charcoal/30 bg-white px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-charcoal disabled:bg-charcoal/5";
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
export const btn = {
  primary: `${btnBase} bg-charcoal text-offwhite hover:bg-charcoal/90`,
  secondary: `${btnBase} border border-charcoal/40 bg-white text-charcoal hover:bg-offwhite`,
  danger: `${btnBase} bg-red-700 text-white hover:bg-red-800`,
  ghost: `${btnBase} text-charcoal underline-offset-4 hover:underline`,
  small: "px-2.5 py-1 text-xs",
} as const;

