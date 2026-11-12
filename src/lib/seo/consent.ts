/**
 * Cookie-consent contract (owner: seo-content). Isomorphic, no I/O.
 * One cookie, first-party, 6 months, set ONLY after an explicit choice:
 *   btnv_consent = "granted" | "denied"
 * Default (no cookie) = no analytics script, no tracking cookie.
 */
export const CONSENT_COOKIE = "btnv_consent";
export const CONSENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 182; // ~6 months
export type ConsentValue = "granted" | "denied";

export function parseConsent(v: string | undefined | null): ConsentValue | null {
  return v === "granted" || v === "denied" ? v : null;
}

export const GA4_ID_RE = /^G-[A-Z0-9]{4,20}$/;
/** Plausible `data-domain`: a bare host name. */
export const PLAUSIBLE_DOMAIN_RE = /^(?=.{3,120}$)([a-z0-9-]+\.)+[a-z]{2,}$/i;

export function analyticsIdIsValid(provider: "none" | "plausible" | "ga4", id: string): boolean {
  if (provider === "ga4") return GA4_ID_RE.test(id);
  if (provider === "plausible") return PLAUSIBLE_DOMAIN_RE.test(id);
  return false;
}

export type AnalyticsConfig = { provider: "none" | "plausible" | "ga4"; id: string; enabled: boolean; requiresConsent: boolean };

/** True when a consent banner must be offered (an enabled, valid provider that needs consent). */
export function consentRequired(a: AnalyticsConfig): boolean {
  if (!a.enabled || a.provider === "none" || !analyticsIdIsValid(a.provider, a.id)) return false;
  return a.provider === "ga4" ? true : a.requiresConsent; // GA4 can never be consent-free
}

/** True when the tracking script may be injected for this visitor. */
export function scriptAllowed(a: AnalyticsConfig, consent: ConsentValue | null): boolean {
  if (!a.enabled || a.provider === "none" || !analyticsIdIsValid(a.provider, a.id)) return false;
  return consentRequired(a) ? consent === "granted" : true;
}
