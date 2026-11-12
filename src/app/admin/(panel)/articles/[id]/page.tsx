import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { toParisLocalInput } from "@/lib/cms/datetime";
import { loadMediaItems, mediaIdsOfDoc, revisionRows } from "@/lib/cms/queries";
import { parseRichText } from "@/lib/richtext/schema";
import { PageHeader } from "@/components/admin/AdminShell";
import { PostEditor } from "@/components/admin/PostEditor";
import { Notice } from "@/components/admin/ui";

export const metadata = { title: "Modifier l’article" };

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("EDITOR");
  const { id } = await params;
  const post = await db.post.findUnique({ where: { id }, include: { tags: { include: { tag: true } } } });
  if (!post) notFound();
  const [categories, tags, revisions] = await Promise.all([
    db.category.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.tag.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { name: true } }),
    revisionRows("post", id),
  ]);
  const body = parseRichText(post.body);
  const media = await loadMediaItems([...mediaIdsOfDoc(body), post.coverImageId, post.ogImageId]);
  const live = post.status === "PUBLISHED" || post.status === "SCHEDULED";
  return (
    <main>
      <PageHeader title={post.title} intro={`/blog/${post.slug}`} />
      {post.deletedAt ? <div className="mb-4"><Notice kind="warn">Cet article est dans la corbeille. Restaurez-le pour le modifier.</Notice></div> : null}
      <PostEditor
        id={post.id}
        isLive={live && !post.deletedAt}
        preview={`/admin/apercu/article/${post.id}`}
        categories={categories}
        allTags={tags.map((t) => t.name)}
        revisions={revisions}
        initialMedia={media}
        initial={{
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt ?? "",
          body: body as unknown as Record<string, unknown>,
          coverImageId: post.coverImageId,
          categoryId: post.categoryId,
          tags: post.tags.filter((t) => !t.tag.deletedAt).map((t) => t.tag.name),
          authorDisplayName: post.authorDisplayName ?? "",
          isPlaceholder: post.isPlaceholder,
          status: { status: post.status, scheduledAt: toParisLocalInput(post.scheduledAt) },
          seo: { metaTitle: post.metaTitle ?? "", metaDescription: post.metaDescription ?? "", ogImageId: post.ogImageId, noindex: post.noindex, canonicalPath: post.canonicalPath ?? "" },
        }}
      />
    </main>
  );
}
