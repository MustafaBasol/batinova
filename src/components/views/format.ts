import { SITE } from "@/lib/config/site";

/** « 12 novembre 2026 » in fr-FR / Europe/Paris. */
export function formatDateFr(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat(SITE.locale, { day: "numeric", month: "long", year: "numeric", timeZone: SITE.timezone }).format(new Date(d));
}

/** ISO date (yyyy-mm-dd) for <time dateTime>. */
export function isoDate(d: Date | string | null | undefined): string | undefined {
  return d ? new Date(d).toISOString().slice(0, 10) : undefined;
}

/** Plain text with line breaks preserved -> array of paragraphs (split on blank lines). */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}
