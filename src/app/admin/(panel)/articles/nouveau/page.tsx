import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/AdminShell";
import { PostEditor } from "@/components/admin/PostEditor";
import { emptyPost } from "@/components/admin/defaults";

export const metadata = { title: "Nouvel article" };

export default async function NewPost() {
  await requireRole("EDITOR");
  const [categories, tags] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.tag.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  return (
    <main>
      <PageHeader title="Nouvel article" />
      <PostEditor initial={emptyPost()} initialMedia={[]} categories={categories} allTags={tags.map((t) => t.name)} revisions={[]} />
    </main>
  );
}
