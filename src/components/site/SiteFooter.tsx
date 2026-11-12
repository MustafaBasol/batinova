/**
 * Footer (server). Address/phone/email come ONLY from settings; phone shown only if verified,
 * e-mail only if the mailbox is provisioned or the public e-mail is verified. Single head office.
 */
import Link from "next/link";
import { SITE, SERVICE_AREAS } from "@/lib/config/site";
import { isVerified, type SiteSettings } from "@/lib/settings-schema";
import { Logo } from "./Logo";
import type { NavLinkItem } from "./SiteNav";

export function SiteFooter({ primary, legal, settings }: { primary: NavLinkItem[]; legal: NavLinkItem[]; settings: SiteSettings }) {
  const a = settings.address;
  const phone = isVerified(settings.company.phone) ? settings.company.phone.value : null;
  const email = isVerified(settings.company.publicEmail)
    ? settings.company.publicEmail.value
    : settings.emailRouting.contact.provisioned
      ? settings.emailRouting.contact.address
      : null;
  const year = new Intl.DateTimeFormat("fr-FR", { year: "numeric", timeZone: SITE.timezone }).format(new Date());
  const col = "text-[0.78rem] font-medium uppercase tracking-[0.2em] text-beige";
  return (
    <footer className="site-footer on-dark bg-charcoal text-offwhite">
      <div className="wrap section-tight pb-10">
        <div className="grid gap-12 border-b border-offwhite/20 pb-14 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Logo variant="onDark" className="w-[11rem]" />
            <p className="display mt-8 text-[clamp(2rem,4vw,3rem)] text-offwhite">{SITE.slogan}</p>
            <Link href="/devis" className="btn btn-beige mt-8">
              Demander un devis
            </Link>
          </div>
          <div className="grid gap-10 sm:grid-cols-3 lg:col-span-7">
            <div>
              <h2 className={col}>Navigation</h2>
              <ul className="mt-5 space-y-3">
                {primary.map((l) => (
                  <li key={l.id}>
                    <Link href={l.href} className="link-line text-offwhite/90">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className={col}>Zones d’intervention</h2>
              <ul className="mt-5 space-y-3">
                {SERVICE_AREAS.map((z) => (
                  <li key={z.code}>
                    <Link href={`/${z.path}`} className="link-line text-offwhite/90">
                      {z.name}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-sm text-offwhite/75">Intervention depuis notre siège unique en Île-de-France.</p>
            </div>
            <div>
              <h2 className={col}>Contact</h2>
              <address className="mt-5 space-y-3 not-italic text-offwhite/90">
                {a.showOnSite && (
                  <p>
                    Siège : {a.streetAddress}, {a.postalCode} {a.addressLocality}
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
                <p>
                  <Link className="link-line" href="/devis">
                    Formulaire de demande de devis
                  </Link>
                </p>
              </address>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4 pt-8 text-sm text-offwhite/75 lg:flex-row lg:items-start lg:justify-between">
          <p>
            © {year} {SITE.name}. Les visuels signalés « Illustration » sont des photographies libres de droits qui
            ne représentent pas nos chantiers.
          </p>
          {legal.length > 0 && (
            <nav aria-label="Informations légales">
              <ul className="flex flex-wrap gap-x-6 gap-y-2">
                {legal.map((l) => (
                  <li key={l.id}>
                    <Link href={l.href} className="link-line">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}
