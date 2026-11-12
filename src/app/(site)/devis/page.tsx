import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/site/BreadcrumbNav";
import { simpleBreadcrumbs } from "@/components/site/breadcrumbs";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { PROJECT_TYPES } from "@/lib/leads/options";
import { getSettings } from "@/lib/settings";
import { JsonLd } from "@/components/seo/JsonLd";
import { buildBreadcrumbList, graph } from "@/lib/seo/jsonld";
import { seoMetadata } from "@/lib/seo/server";
import { submitQuote } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return seoMetadata({
    title: "Demander un devis",
    description: "Décrivez votre projet de rénovation, d’extension ou de construction en quelques étapes : BatiNova Construction revient vers vous.",
    path: "/devis",
  });
}

type Props = { searchParams: Promise<{ source?: string; type?: string }> };

export default async function QuotePage({ searchParams }: Props) {
  const sp = await searchParams;
  const settings = await getSettings();
  const source = sp.source && /^[a-z0-9:_-]{1,60}$/.test(sp.source) ? sp.source : undefined;
  const type = sp.type && sp.type in PROJECT_TYPES ? sp.type : undefined;
  return (
    <>
      <JsonLd data={graph(buildBreadcrumbList(simpleBreadcrumbs("Demander un devis", "/devis")))} />
      <div className="wrap pt-6">
        <Breadcrumbs items={simpleBreadcrumbs("Demander un devis", "/devis")} />
      </div>
      <div className="wrap grid gap-12 pb-20 pt-10 sm:pt-14 lg:grid-cols-12 lg:gap-16 lg:pb-32 lg:pt-20">
        <header className="lg:col-span-4">
          <p className="eyebrow rise">Devis</p>
          <h1 id="devis-titre" className="display h-page rise rise-2 mt-5 !text-[clamp(2.5rem,5vw,4.5rem)]">
            Demander un devis
          </h1>
          <p className="lead rise rise-3 mt-6">
            Cinq courtes étapes pour nous présenter votre projet. Plus nous en savons, plus notre premier échange sera utile.
          </p>
          <ul className="rise rise-4 mt-8 space-y-3 text-charcoal/85">
            <li className="card-line pt-3">Réponse personnalisée, sans engagement.</li>
            <li className="card-line pt-3">Intervention en Île-de-France, Normandie et Manche.</li>
            <li className="card-line pt-3">Vos données ne servent qu’à traiter votre demande.</li>
          </ul>
        </header>
        <div className="lg:col-span-8">
          <QuoteForm action={submitQuote} attachmentsEnabled={settings.leads.attachmentsEnabled} source={source} initialType={type} />
        </div>
      </div>
    </>
  );
}
