import "server-only";
import { cookies } from "next/headers";
import Script from "next/script";
import { getSettings } from "@/lib/content/public";
import { CONSENT_COOKIE, consentRequired, parseConsent, scriptAllowed } from "@/lib/seo/consent";
import { ConsentBanner, CookiePreferencesButton } from "./ConsentBanner";

/**
 * Consent-gated analytics (server component, rendered from the public layout).
 * Default settings (provider "none" / disabled) => renders NOTHING: no script, no banner, no cookie.
 * The banner appears only when an enabled, valid provider requires consent and no choice is stored.
 * NOTE: the static CSP in next.config.ts allows no third-party origin; enabling a provider requires
 * extending script-src / connect-src there (documented in docs/SEO_IMPLEMENTATION.md).
 */
export async function Analytics() {
  const { analytics: a } = await getSettings();
  const needsConsent = consentRequired(a);
  const consent = needsConsent ? parseConsent((await cookies()).get(CONSENT_COOKIE)?.value) : null;
  const load = scriptAllowed(a, consent);

  return (
    <>
      {load && a.provider === "plausible" && (
        <Script defer data-domain={a.id} src="https://plausible.io/js/script.js" strategy="afterInteractive" />
      )}
      {load && a.provider === "ga4" && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(a.id)}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${JSON.stringify(a.id)},{anonymize_ip:true});`}
          </Script>
        </>
      )}
      {needsConsent && consent === null && <ConsentBanner />}
      {needsConsent && consent !== null && (
        <p className="wrap pb-4 text-xs text-charcoal/70">
          <CookiePreferencesButton />
        </p>
      )}
    </>
  );
}
