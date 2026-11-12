// Protected admin shell. Owner: cms-admin.
// MUST keep `await requireUser()` at the top. Layout guards are defence in depth
// only: each page, Server Action and Route Handler ALSO calls requireUser()/requireRole() itself.
import { requireUser } from "@/lib/auth/guards";
import { logoutAction } from "@/lib/auth/actions";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminProviders } from "@/components/admin/ui";
import "@/components/admin/admin.css";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AdminProviders>
      <AdminShell user={{ name: user.name, role: user.role }} logout={logoutAction}>
        {children}
      </AdminShell>
    </AdminProviders>
  );
}
