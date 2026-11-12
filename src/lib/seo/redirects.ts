import "server-only";
import { db } from "@/lib/db";

/**
 * DB-driven redirects (owner: seo-content). Used by src/proxy.ts (Node.js runtime in Next 16),
 * so a redirect/410 is answered BEFORE any route renders, for every kind of URL
 * (pages, posts, projects, categories, legacy paths).
 *
 * - whole table cached in-process for CACHE_TTL_MS (the table is small; admin edits apply within ~1 min);
 * - chains A -> B -> C are collapsed into one hop; loops and chains longer than MAX_HOPS are ignored (-> 404 by the route);
 * - 410 returns { status: 410 };
 * - hit counters are batched in memory and flushed asynchronously (never block or fail a request).
 */

export type RedirectRow = { fromPath: string; toPath: string | null; statusCode: number };
export type RedirectResolution = { status: 301 | 302 | 308; to: string } | { status: 410 };

export const CACHE_TTL_MS = 60_000;
export const MAX_HOPS = 5;
const MAX_ROWS = 10_000;
const FLUSH_MS = 30_000;
const FLUSH_AT = 25;

/** Lower-case-insensitive exact match on the path; trailing slash ignored (except "/"). */
export function normalizeFrom(pathname: string): string {
  let p = pathname.trim();
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}

function safeTarget(to: string | null): string | null {
  if (!to) return null;
  const t = to.trim();
  if (t.startsWith("//") || t.startsWith("/\\")) return null; // protocol-relative: open redirect
  if (t.startsWith("/")) return t;
  return /^https:\/\//i.test(t) ? t : null;
}

/** Pure resolution against an in-memory table (unit-tested). */
export function resolveFromTable(table: ReadonlyMap<string, RedirectRow>, pathname: string): (RedirectResolution & { hitPath?: string }) | null {
  const start = table.get(normalizeFrom(pathname));
  if (!start) return null;
  const seen = new Set<string>([start.fromPath]);
  let row = start;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    if (row.statusCode === 410) return { status: 410, hitPath: start.fromPath };
    const target = safeTarget(row.toPath);
    if (!target) return null;
    const targetKey = target.startsWith("/") ? normalizeFrom((target.split("?")[0] ?? "").split("#")[0] ?? "") : null;
    const next = targetKey ? table.get(targetKey) : undefined;
    if (!next) {
      const status = [301, 302, 308].includes(start.statusCode) ? (start.statusCode as 301 | 302 | 308) : 301;
      return { status, to: target, hitPath: start.fromPath };
    }
    if (seen.has(next.fromPath)) return null; // loop
    seen.add(next.fromPath);
    row = next;
  }
  return null; // chain too long
}

let cache: { at: number; table: Map<string, RedirectRow> } | null = null;

async function loadTable(): Promise<Map<string, RedirectRow>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.table;
  const rows = await db.redirect.findMany({
    select: { fromPath: true, toPath: true, statusCode: true },
    take: MAX_ROWS,
  });
  const table = new Map<string, RedirectRow>();
  for (const r of rows) table.set(normalizeFrom(r.fromPath), r);
  cache = { at: now, table };
  return table;
}

/** Forget the cached table (tests, and callers living in the same bundle as this module). */
export function invalidateRedirectCache(): void {
  cache = null;
}

// ---- batched hit counter -------------------------------------------------

const pendingHits = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushHits(): Promise<void> {
  flushTimer = null;
  const batch = [...pendingHits];
  pendingHits.clear();
  for (const [fromPath, n] of batch) {
    try {
      await db.redirect.updateMany({ where: { fromPath }, data: { hits: { increment: n } } });
    } catch {
      /* counters are best-effort */
    }
  }
}

function recordHit(fromPath: string): void {
  pendingHits.set(fromPath, (pendingHits.get(fromPath) ?? 0) + 1);
  if (pendingHits.size >= FLUSH_AT) {
    void flushHits();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => void flushHits(), FLUSH_MS);
    flushTimer.unref?.();
  }
}

/** Test helper: flush pending counters now. */
export const flushRedirectHits = flushHits;

/**
 * Resolve a request path (no query) against the Redirect table.
 * Returns null when there is no applicable rule or when the lookup fails (never throws).
 */
export async function resolveRedirect(pathname: string): Promise<RedirectResolution | null> {
  try {
    const hit = resolveFromTable(await loadTable(), pathname);
    if (!hit) return null;
    const { hitPath, ...res } = hit;
    if (hitPath) recordHit(hitPath);
    return res;
  } catch {
    return null;
  }
}

/** French body of the 410 response (kept here so tests and proxy agree). */
export const GONE_HTML = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Contenu supprimé</title></head><body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#303030;background:#F5F2EC"><h1>Contenu supprimé</h1><p>Cette page a été définitivement supprimée.</p><p><a href="/">Retour à l’accueil</a></p></body></html>`;
