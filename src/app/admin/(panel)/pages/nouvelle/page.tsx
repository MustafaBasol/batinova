import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { PAGE_TEMPLATES, type PageTemplateKey } from "@/lib/cms/constants";
import { PageHeader } from "@/components/admin/AdminShell";
import { PageEditor } from "@/components/admin/PageEditor";
import { emptyPage } from "@/components/admin/defaults";

export const metadata = { title: "Nouvelle page" };

export default async function NewPage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  await requireRole("EDITOR");
  const sp = await searchParams;
  const template = (PAGE_TEMPLATES as readonly string[]).includes(sp.template ?? "") ? (sp.template as PageTemplateKey) : "STANDARD";
  const parents = await db.page.findMany({ where: { deletedAt: null }, select: { id: true, title: true, path: true }, orderBy: { path: "asc" } });
  return (
    <main>
      <PageHeader title={template === "SERVICE" ? "Nouveau service" : "Nouvelle page"} />
      <PageEditor initial={emptyPage(template)} initialMedia={[]} parents={parents} revisions={[]} />
    </main>
  );
}
