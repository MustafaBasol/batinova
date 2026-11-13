import Link from "next/link";
import type { Metadata } from "next";
import { connection } from "next/server";
import { SiteShell } from "@/components/site/SiteShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Page introuvable", robots: { index: false, follow: true } };

// connection(): force request-time rendering. `export const dynamic` is not honoured when the webpack build prerenders
// /_global-error from this boundary, which would query the database (no DATABASE_URL guarantee) during `next build`.
export default async function NotFound() {
  await connection();
  return (
    <SiteShell>
      <section className="wrap section">
        <p className="eyebrow">Erreur 404</p>
        <h1 className="display h-page mt-4 max-w-3xl">Cette page est introuvable.</h1>
        <p className="lead mt-6">
          Le lien est peut-être incomplet, ou la page a été déplacée. Reprenez depuis l’accueil ou parlez-nous directement de votre projet.
        </p>
        <div className="mt-10 flex flex-wrap gap-4">
          <Link href="/" className="btn btn-primary">
            Retour à l’accueil
          </Link>
          <Link href="/devis" className="btn btn-outline">
            Demander un devis
          </Link>
        </div>
      </section>
    </SiteShell>
  );
}
