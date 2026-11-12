// Placeholder dashboard proving the guard. Owner: cms-admin (replace freely,
// keep the requireUser() call).
import { requireUser } from "@/lib/auth/guards";

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  return (
    <main>
      <h1 className="font-serif text-2xl mb-2">Tableau de bord</h1>
      {sp.refus ? (
        <p role="alert" className="mb-4 text-red-700">
          Accès refusé : cette action est réservée au propriétaire.
        </p>
      ) : null}
      <p>Bienvenue, {user.name}. L’interface d’administration sera ajoutée en phase 3.</p>
    </main>
  );
}
