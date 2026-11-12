/**
 * Public site chrome: fonts, skip link, header (logo, nav from listNavItems('HEADER'), quote CTA),
 * <main id="contenu"> and footer. Used by src/app/(site)/layout.tsx and src/app/not-found.tsx.
 * Server component (DB reads: nav + settings).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { listNavItems, listNavPages, type PublicNavItem } from "@/lib/content/public";
import { getSettings } from "@/lib/settings";
import { fontClassNames } from "./fonts";
import { Logo } from "./Logo";
import { SiteNav, type NavLinkItem } from "./SiteNav";
import { SiteFooter } from "./SiteFooter";

const toLink = (n: PublicNavItem): NavLinkItem => ({
  id: n.id,
  label: n.label,
  href: n.href,
  openInNewTab: n.openInNewTab,
  children: n.children.map(toLink),
});

export async function SiteShell({ children }: { children: ReactNode }) {
  const [header, footerPrimary, footerLegal, settings] = await Promise.all([
    listNavItems("HEADER"),
    listNavItems("FOOTER_PRIMARY"),
    listNavItems("FOOTER_LEGAL"),
    getSettings(),
  ]);
  let headerItems: NavLinkItem[] = header.map(toLink);
  if (headerItems.length === 0) {
    const pages = await listNavPages();
    headerItems = pages.map((p) => ({ id: p.path, label: p.label, href: p.href }));
  }
  return (
    <div className={`site-shell ${fontClassNames}`}>
      <a href="#contenu" className="skip-link">
        Aller au contenu
      </a>
      <header className="site-header">
        <div className="wrap flex h-[4.5rem] items-center justify-between gap-6 min-[1180px]:h-24">
          <Link href="/" aria-label="BatiNova Construction — accueil" className="flex-none">
            <Logo variant="color" priority className="w-[8.75rem] min-[1180px]:w-[11rem]" />
          </Link>
          <div className="flex items-center gap-8 xl:gap-12">
            <SiteNav items={headerItems} ctaHref="/devis" ctaLabel="Demander un devis" />
          </div>
        </div>
      </header>
      <main id="contenu" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter
        primary={footerPrimary.map(toLink)}
        legal={footerLegal.map(toLink)}
        settings={settings}
      />
    </div>
  );
}
