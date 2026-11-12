/**
 * `contactForm` block. There is ONE quote flow (/devis): this block presents the entry point plus the
 * contact details that exist in settings (phone only if verified, e-mail only if provisioned/verified).
 */
import Link from "next/link";
import type { BlockOf } from "@/lib/blocks/schema";
import { getSettings } from "@/lib/settings";
import { isVerified } from "@/lib/settings-schema";

export async function ContactCta({ block }: { block: BlockOf<"contactForm"> }) {
  const s = await getSettings();
  const phone = isVerified(s.company.phone) ? s.company.phone.value : null;
  const email = isVerified(s.company.publicEmail)
    ? s.company.publicEmail.value
    : s.emailRouting.contact.provisioned
      ? s.emailRouting.contact.address
      : null;
  const href = block.source ? `/devis?source=${encodeURIComponent(block.source)}` : "/devis";
  return (
    <section className="wrap section">
      <div className="grid gap-12 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="eyebrow mb-4">Contact</p>
          <h2 className="display h-section">{block.heading ?? "Parlons de votre projet"}</h2>
          <p className="lead mt-6">
            Décrivez votre projet en quelques étapes : type de travaux, localisation, budget indicatif et délais souhaités. Nous revenons vers vous pour en discuter.
          </p>
          <Link href={href} className="btn btn-primary mt-10">
            Demander un devis
          </Link>
        </div>
        <div className="card-line pt-8 lg:col-span-4 lg:col-start-9">
          <h3 className="eyebrow">Coordonnées</h3>
          <address className="mt-5 space-y-3 not-italic">
            {s.address.showOnSite && (
              <p>
                Siège : {s.address.streetAddress}, {s.address.postalCode} {s.address.addressLocality}
              </p>
            )}
            {phone && (
              <p>
                <a className="link-line" href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
                  {phone}
                </a>
              </p>
            )}
            {email && (
              <p>
                <a className="link-line" href={`mailto:${email}`}>
                  {email}
                </a>
              </p>
            )}
            <p className="text-sm text-charcoal/75">
              Zones d’intervention : Île-de-France, Normandie, Manche.
            </p>
          </address>
        </div>
      </div>
    </section>
  );
}
