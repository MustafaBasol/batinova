import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { NAV_LOCATIONS, type NavLocationKey } from "@/lib/cms/constants";
import { PageHeader } from "@/components/admin/AdminShell";
import { NavEditor, type NavNode } from "@/components/admin/NavEditor";

export const metadata = { title: "Navigation" };

export default async function NavigationPage() {
  await requireRole("EDITOR");
  const [rows, pages] = await Promise.all([
    db.navItem.findMany({ orderBy: [{ sortOrder: "asc" }] }),
    db.page.findMany({ where: { deletedAt: null }, select: { id: true, title: true, path: true }, orderBy: { path: "asc" } }),
  ]);
  const data = Object.fromEntries(NAV_LOCATIONS.map((l) => [l, [] as NavNode[]])) as Record<NavLocationKey, NavNode[]>;
  const node = (r: (typeof rows)[number]): NavNode => ({ id: r.id, label: r.label, pageId: r.pageId, href: r.href ?? "", openInNewTab: r.openInNewTab, enabled: r.enabled, children: [] });
  for (const r of rows.filter((x) => !x.parentId)) {
    const n = node(r);
    n.children = rows.filter((c) => c.parentId === r.id).map(node);
    data[r.location].push(n);
  }
  return (
    <main>
      <PageHeader title="Navigation" intro="Menu principal et liens du pied de page." />
      <NavEditor data={data} pages={pages} />
    </main>
  );
}
