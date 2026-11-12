import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/AdminShell";
import { TaxonomyManager } from "@/components/admin/TaxonomyManager";

export const metadata = { title: "Catégories et étiquettes" };

export default async function TaxonomyPage() {
  await requireRole("EDITOR");
  const [cats, tags] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { posts: true } } } }),
    db.tag.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, include: { _count: { select: { posts: true } } } }),
  ]);
  return (
    <main>
      <PageHeader title="Catégories et étiquettes" intro="Classez les articles du blog. Une catégorie par article, plusieurs étiquettes possibles." />
      <TaxonomyManager
        categories={cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, description: c.description ?? "", metaTitle: c.metaTitle ?? "", metaDescription: c.metaDescription ?? "", posts: c._count.posts }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug, posts: t._count.posts }))}
      />
    </main>
  );
}
