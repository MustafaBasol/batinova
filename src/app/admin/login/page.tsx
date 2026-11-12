// Owner: architect-security. cms-admin may restyle the markup but must keep
// loginAction, the hidden `next` field and the noindex metadata.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Connexion — Administration",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await getCurrentUser()) redirect("/admin");
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;

  return (
    <main className="min-h-screen flex items-center justify-center bg-offwhite px-4">
      <div className="w-full max-w-sm bg-white border border-beige/40 p-8">
        <h1 className="font-serif text-2xl text-charcoal mb-1">BatiNova</h1>
        <p className="text-sm text-charcoal/70 mb-6">Espace d’administration</p>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
