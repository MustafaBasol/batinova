import { db } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { invalidateRedirectCache } from "@/lib/seo/redirects";
import { isSafeInternalPath, isSafeHref } from "@/lib/security/href";
import { CmsError } from "./result";

/** 301 management (owner: cms-admin): chains collapsed, loops refused. */

const MAX_HOPS = 12;
export const REDIRECT_PATH_RE = /^\/[A-Za-z0-9\-._~/%]*$/;
const FORBIDDEN_FROM = [/^\/admin(\/|$)/, /^\/api(\/|$)/, /^\/_next(\/|$)/, /^\/media(\/|$)/];

export function validateFromPath(p: string): string | null {
  if (!REDIRECT_PATH_RE.test(p) || p.startsWith("//") || p.length > 512) return "Chemin source invalide (ex. /ancienne-page, sans domaine ni paramètres).";
  if (FORBIDDEN_FROM.some((r) => r.test(p))) return "Ce chemin est réservé au système.";
  if (p === "/") return "La page d’accueil ne peut pas être redirigée.";
  return null;
}

export function validateToPath(p: string): string | null {
  if (p.startsWith("/")) return isSafeInternalPath(p) && !p.startsWith("//") ? null : "Destination invalide.";
  return isSafeHref(p) && p.toLowerCase().startsWith("https://") ? null : "Destination : chemin interne (/page) ou URL https.";
}

/** True when following `to` through existing redirects leads back to `from` (or `from === to`). */
export async function wouldLoop(from: string, to: string, ignoreId?: string): Promise<boolean> {
  if (from === to) return true;
  let cur = to;
  const seen = new Set<string>([from]);
  for (let i = 0; i < MAX_HOPS; i++) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    const next = await db.redirect.findUnique({ where: { fromPath: cur } });
    if (!next || next.id === ignoreId || !next.toPath || next.statusCode === 410) return false;
    cur = next.toPath;
  }
  return true; // too deep => treat as loop
}

/** A piece of content now lives at `url`: any redirect FROM that url would shadow it -> remove. */
export async function clearRedirectFrom(url: string): Promise<void> {
  await db.redirect.deleteMany({ where: { fromPath: url } });
  invalidateRedirectCache();
}

/**
 * Content moved from `oldUrl` to `newUrl`: 301 old -> new, existing redirects that
 * pointed at oldUrl are re-pointed to newUrl (no chains), a redirect from newUrl is removed (no loop).
 */
export async function recordMove(oldUrl: string, newUrl: string, actorId: string | null): Promise<void> {
  if (oldUrl === newUrl) return;
  await clearRedirectFrom(newUrl);
  await db.redirect.updateMany({ where: { toPath: oldUrl }, data: { toPath: newUrl } });
  if (oldUrl === "/") return; // home is never redirected away
  const existing = await db.redirect.findUnique({ where: { fromPath: oldUrl } });
  if (existing) {
    await db.redirect.update({ where: { id: existing.id }, data: { toPath: newUrl, statusCode: 301 } });
  } else {
    await db.redirect.create({ data: { fromPath: oldUrl, toPath: newUrl, statusCode: 301, note: "Automatique (changement d’adresse)", createdById: actorId } });
  }
  invalidateRedirectCache();
  await audit(actorId, "redirect.auto", { type: "Redirect" }, { fromPath: oldUrl, toPath: newUrl });
}

export async function assertNoLoop(from: string, to: string | null, ignoreId?: string) {
  if (to && (await wouldLoop(from, to, ignoreId))) {
    throw new CmsError("Cette redirection créerait une boucle.", { toPath: "Boucle de redirections détectée." });
  }
}
