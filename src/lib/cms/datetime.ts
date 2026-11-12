/** Europe/Paris <-> UTC helpers for `datetime-local` inputs (isomorphic; owner: cms-admin). */
const TZ = "Europe/Paris";

function partsInParis(d: Date) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return { y: o.year!, mo: o.month!, d: o.day!, h: o.hour!, mi: o.minute! };
}

/** Date -> "YYYY-MM-DDTHH:mm" (Paris wall-clock) for <input type="datetime-local">. */
export function toParisLocalInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const p = partsInParis(date);
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`;
}

/** "YYYY-MM-DDTHH:mm" read as Paris wall-clock -> UTC Date (null when invalid). */
export function fromParisLocalInput(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = partsInParis(new Date(guess));
    const shown = Date.UTC(Number(p.y), Number(p.mo) - 1, Number(p.d), Number(p.h), Number(p.mi));
    guess += wall - shown;
  }
  const out = new Date(guess);
  return Number.isNaN(out.getTime()) ? null : out;
}

export function formatParis(d: Date | string | null | undefined, withTime = true): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: TZ,
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}
