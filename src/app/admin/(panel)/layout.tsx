// Protected admin shell. Owner: cms-admin (created by architect-security).
// MUST keep `await requireUser()` at the top. Layout guards are defence in depth
// only: each page, Server Action and Route Handler must ALSO call
// requireUser()/requireRole() itself (layouts do not re-run on every action).
import { requireUser } from "@/lib/auth/guards";
import { logoutAction } from "@/lib/auth/actions";

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-beige/40 bg-white px-6 py-3">
        <span className="font-serif">BatiNova — Administration</span>
        <div className="flex items-center gap-4 text-sm">
          <span>
            {user.name} ({user.role === "OWNER" ? "Propriétaire" : "Éditeur"})
          </span>
          <form action={logoutAction}>
            <button type="submit" className="underline underline-offset-4">
              Se déconnecter
            </button>
          </form>
        </div>
      </header>
      <div className="p-6">{children}</div>
    </div>
  );
}
