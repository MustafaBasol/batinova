import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth/guards";
import { formatParis } from "@/lib/cms/datetime";
import { PageHeader } from "@/components/admin/AdminShell";
import { UsersManager } from "@/components/admin/UsersManager";

export const metadata = { title: "Utilisateurs" };

export default async function UsersPage() {
  const me = await requireRole("OWNER");
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, active: true, lastLoginAt: true } });
  return (
    <main>
      <PageHeader title="Utilisateurs" intro="Comptes ayant accès à l’administration (propriétaire uniquement)." />
      <UsersManager users={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt ? formatParis(u.lastLoginAt) : null, isSelf: u.id === me.id }))} />
    </main>
  );
}
