import { z } from "zod";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/security/audit";
import { isSafeHref } from "@/lib/security/href";
import { NAV_LOCATIONS } from "./constants";
import { CmsError, parseOrThrow } from "./result";

/** Navigation management (owner: cms-admin). EDITOR+. One nesting level (HEADER only). */
const item = z.object({
  id: z.string().max(64).optional(),
  label: z.string().trim().min(1, "Libellé requis").max(60),
  pageId: z.string().max(64).nullish(),
  href: z.string().trim().max(2048).nullish(),
  openInNewTab: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
const NavSchema = z.object({
  location: z.enum(NAV_LOCATIONS),
  items: z.array(item.extend({ children: z.array(item).max(12).default([]) })).max(30),
});

export async function saveNavLocation(actor: SessionUser, raw: unknown): Promise<void> {
  const { location, items } = parseOrThrow(NavSchema, raw);
  const fieldErrors: Record<string, string> = {};
  const pageIds = new Set<string>();
  const check = (it: z.infer<typeof item>, key: string) => {
    if (it.pageId) pageIds.add(it.pageId);
    else if (!it.href || !isSafeHref(it.href)) fieldErrors[key] = "Choisissez une page ou saisissez un lien valide (/chemin, https://…, mailto:, tel:).";
  };
  items.forEach((it, i) => {
    check(it, `item:${i}`);
    if (location !== "HEADER" && it.children.length) fieldErrors[`item:${i}`] = "Les sous-menus ne sont possibles que dans l’en-tête.";
    it.children.forEach((c, j) => check(c, `item:${i}.${j}`));
  });
  if (Object.keys(fieldErrors).length) throw new CmsError("Certains liens de navigation sont invalides.", fieldErrors);
  if (pageIds.size) {
    const found = await db.page.count({ where: { id: { in: [...pageIds] }, deletedAt: null } });
    if (found !== pageIds.size) throw new CmsError("Une page sélectionnée n’existe plus.");
  }

  // never trust client ids: only ids that already belong to THIS location are updated
  const owned = new Set((await db.navItem.findMany({ where: { location }, select: { id: true } })).map((r) => r.id));
  const keep = new Set<string>();
  const base = (it: z.infer<typeof item>, sortOrder: number, parentId: string | null) => ({
    location,
    label: it.label,
    pageId: it.pageId || null,
    href: it.pageId ? null : (it.href ?? null),
    openInNewTab: it.openInNewTab,
    enabled: it.enabled,
    sortOrder,
    parentId,
  });
  const upsert = async (it: z.infer<typeof item>, sortOrder: number, parentId: string | null) => {
    if (it.id && owned.has(it.id)) {
      keep.add(it.id);
      return db.navItem.update({ where: { id: it.id }, data: base(it, sortOrder, parentId) });
    }
    const row = await db.navItem.create({ data: base(it, sortOrder, parentId) });
    keep.add(row.id);
    return row;
  };
  for (const [i, it] of items.entries()) {
    const parent = await upsert(it, i * 10, null);
    for (const [j, c] of it.children.entries()) await upsert(c, j * 10, parent.id);
  }
  const drop = [...owned].filter((id) => !keep.has(id));
  if (drop.length) await db.navItem.deleteMany({ where: { id: { in: drop } } });
  await audit(actor.id, "nav.update", { type: "NavItem" }, { count: keep.size, status: location });
}
