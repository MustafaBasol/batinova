// Owner: architect-security. cms-admin may restyle the markup but must keep
// loginAction, the hidden `next` field and the noindex metadata.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/guards";
import { Logo } from "@/components/site/Logo";
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
    <main className="flex min-h-screen items-center justify-center bg-offwhite px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo variant="color" priority className="w-[13rem]" />
        </div>
        <div className="border border-beige/50 bg-white p-8 shadow-sm sm:p-10">
          <h1 className="font-serif text-2xl text-charcoal">Espace d’administration</h1>
          <p className="mb-8 mt-2 text-sm leading-relaxed text-charcoal/75">
            Connectez-vous avec votre compte pour gérer le contenu du site.
          </p>
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-charcoal/65">Accès réservé aux membres autorisés de l’équipe.</p>
      </div>
    </main>
  );
}
