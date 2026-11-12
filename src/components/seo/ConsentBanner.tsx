"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CONSENT_COOKIE, CONSENT_MAX_AGE_SECONDS, type ConsentValue } from "@/lib/seo/consent";

function writeConsent(value: ConsentValue | null) {
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    value === null
      ? `${CONSENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`
      : `${CONSENT_COOKIE}=${value}; Max-Age=${CONSENT_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/**
 * Minimal, accessible consent banner. Rendered by <Analytics/> ONLY when an analytics provider that
 * requires consent is enabled and the visitor has not chosen yet. « Accepter » and « Refuser » have
 * identical visual weight (CNIL: refusing must be as easy as accepting).
 */
export function ConsentBanner() {
  const router = useRouter();
  const [custom, setCustom] = useState(false);
  const [measure, setMeasure] = useState(false);
  const [done, setDone] = useState(false);

  function choose(value: ConsentValue) {
    writeConsent(value);
    setDone(true);
    router.refresh();
  }

  if (done) return null;
  const btn = "btn btn-outline w-full sm:w-auto";
  return (
    <section
      role="region"
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-charcoal/30 bg-offwhite p-4 text-charcoal shadow-[0_-8px_24px_rgba(0,0,0,0.08)] sm:p-6"
    >
      <div className="wrap">
        <h2 id="consent-title" className="text-lg font-semibold">
          Votre vie privée
        </h2>
        <p className="mt-2 max-w-3xl text-sm">
          Nous aimerions mesurer l’audience du site pour l’améliorer. Aucun cookie de mesure n’est déposé sans votre accord, et
          votre choix reste valable environ six mois. Plus d’informations dans notre{" "}
          <Link href="/politique-de-confidentialite" className="underline underline-offset-2">
            politique de confidentialité
          </Link>
          .
        </p>
        {custom && (
          <div className="mt-4 max-w-3xl border border-charcoal/20 bg-white p-4">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={measure}
                onChange={(e) => setMeasure(e.target.checked)}
              />
              <span>
                <span className="font-semibold">Mesure d’audience</span>
                <br />
                Statistiques de fréquentation pour comprendre quelles pages sont utiles. Désactivée par défaut.
              </span>
            </label>
            <button type="button" className={`${btn} mt-4`} onClick={() => choose(measure ? "granted" : "denied")}>
              Enregistrer mon choix
            </button>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button type="button" className={btn} onClick={() => choose("granted")}>
            Accepter
          </button>
          <button type="button" className={btn} onClick={() => choose("denied")}>
            Refuser
          </button>
          <button type="button" className={btn} aria-expanded={custom} onClick={() => setCustom((v) => !v)}>
            Personnaliser
          </button>
        </div>
      </div>
    </section>
  );
}

/** Lets a visitor reopen the choice (withdraw consent as easily as it was given). */
export function CookiePreferencesButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="underline underline-offset-2"
      onClick={() => {
        writeConsent(null);
        router.refresh();
      }}
    >
      Gérer mes cookies
    </button>
  );
}
