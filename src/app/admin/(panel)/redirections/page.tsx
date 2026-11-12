import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { PageHeader } from "@/components/admin/AdminShell";
import { RedirectsManager } from "@/components/admin/RedirectsManager";

export const metadata = { title: "Redirections" };

export default async function RedirectsPage() {
  const user = await requireRole("EDITOR");
  const rows = await db.redirect.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  return (
    <main>
      <PageHeader title="Redirections" intro="Renvoyer d’anciennes adresses vers les nouvelles pour ne perdre ni visiteurs ni référencement." />
      <RedirectsManager isOwner={user.role === "OWNER"} rows={rows.map((r) => ({ id: r.id, fromPath: r.fromPath, toPath: r.toPath, statusCode: r.statusCode, hits: r.hits, note: r.note ?? "", auto: (r.note ?? "").startsWith("Automatique") }))} />
    </main>
  );
}
