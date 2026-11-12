"use client";
/**
 * Multi-step quote form (design-frontend). <QuoteForm action attachmentsEnabled? source? initialType? />
 *   action : the Server Action `submitQuote` (src/app/(site)/devis/actions.ts)
 * Steps: 1 projet, 2 localisation, 3 budget & délais, 4 description (+ pièces jointes si activées), 5 coordonnées + RGPD.
 * Accessibility: real fieldset/legend + radios, per-step validation with an alert summary, aria-invalid /
 * aria-describedby, live step announcement, focus moved to the step heading, 48px+ touch targets, no PII in the URL.
 * Progressive enhancement: all steps are in the DOM (hidden attribute) and a <noscript> rule reveals them all,
 * so the form still posts to the Server Action without JavaScript. Client checks are UX only; the server re-validates.
 * Spam: hidden honeypot `website` + `formStartedAt` (minimum fill time enforced server-side).
 */
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { BUDGET_RANGES, CONSENT_CHECKBOX_LABEL, LEAD_REGIONS, PRIVACY_NOTICE_SHORT, PROJECT_TYPES, TIMELINES } from "@/lib/leads/options";
import { LeadInputSchema, regionFromInput } from "@/lib/leads/schema";

export interface QuoteState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

type Values = {
  projectType: string;
  postalCode: string;
  city: string;
  region: string;
  budgetRange: string;
  desiredTimeline: string;
  desiredStartDate: string;
  message: string;
  name: string;
  email: string;
  phone: string;
  consent: boolean;
};

const STEPS = [
  { title: "Votre projet", fields: ["projectType"] },
  { title: "Localisation", fields: ["postalCode", "city", "region"] },
  { title: "Budget et délais", fields: ["budgetRange", "desiredTimeline", "desiredStartDate"] },
  { title: "Description", fields: ["message", "attachments"] },
  { title: "Vos coordonnées", fields: ["name", "email", "phone", "consent"] },
] as const;
const LAST = STEPS.length - 1;
const stepOfField = (f: string) => Math.max(0, STEPS.findIndex((s) => (s.fields as readonly string[]).includes(f)));
const MAX_FILES = 4;
const MAX_BYTES = 4 * 1024 * 1024;

const initial: Values = {
  projectType: "",
  postalCode: "",
  city: "",
  region: "",
  budgetRange: "",
  desiredTimeline: "",
  desiredStartDate: "",
  message: "",
  name: "",
  email: "",
  phone: "",
  consent: false,
};

function validateStep(step: number, v: Values): Record<string, string> {
  const keys = STEPS[step]!.fields.filter((f) => f !== "attachments") as (keyof Values)[];
  const mask = Object.fromEntries(keys.map((k) => [k, true])) as Record<string, true>;
  const schema = LeadInputSchema.pick(mask as never);
  const input: Record<string, unknown> = {};
  for (const k of keys) input[k] = v[k];
  const res = schema.safeParse(input);
  const errs: Record<string, string> = {};
  if (!res.success) for (const i of res.error.issues) errs[String(i.path[0])] ??= i.message;
  return errs;
}

function FieldError({ id, msg }: { id: string; msg?: string }) {
  return msg ? (
    <p id={id} className="field-error">
      {msg}
    </p>
  ) : null;
}

function Choices<T extends Record<string, string>>({
  name,
  legend,
  options,
  value,
  onChange,
  error,
  columns = "sm:grid-cols-2",
  hint,
}: {
  name: string;
  legend: string;
  options: T;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  columns?: string;
  hint?: string;
}) {
  const eid = `${name}-err`;
  return (
    <fieldset aria-describedby={error ? eid : undefined}>
      <legend className="field-label">{legend}</legend>
      {hint && <p className="-mt-1 mb-3 text-sm text-charcoal/75">{hint}</p>}
      <div className={`grid gap-3 ${columns}`}>
        {Object.entries(options).map(([k, label]) => (
          <label key={k} className="choice">
            <input type="radio" name={name} value={k} checked={value === k} onChange={() => onChange(k)} />
            <span className="choice-box">{label}</span>
          </label>
        ))}
      </div>
      <FieldError id={eid} msg={error} />
    </fieldset>
  );
}

export function QuoteForm({
  action,
  attachmentsEnabled = false,
  source,
  initialType,
}: {
  action: (prev: QuoteState, fd: FormData) => Promise<QuoteState>;
  attachmentsEnabled?: boolean;
  source?: string;
  initialType?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as QuoteState);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>({ ...initial, projectType: initialType && initialType in PROJECT_TYPES ? initialType : "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string>("");
  const [startedAt, setStartedAt] = useState("");
  const [regionTouched, setRegionTouched] = useState(false);
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);
  const [moved, setMoved] = useState(false);



  // Focus management: heading of the current step (not on first paint).
  useEffect(() => {
    if (moved) headingRefs.current[step]?.focus();
  }, [step, moved]);

  // Server-side errors: go to the earliest step with an error.
  const [seenState, setSeenState] = useState(state);
  if (seenState !== state) {
    setSeenState(state);
    if (state.status === "error") {
      setErrors(state.fieldErrors ?? {});
      const fe = Object.keys(state.fieldErrors ?? {});
      if (fe.length) setStep(Math.min(...fe.map(stepOfField)));
      setMoved(true);
    }
  }
  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
    if (state.status === "success") doneRef.current?.focus();
  }, [state]);

  const set = <K extends keyof Values>(k: K, v: Values[K]) => {
    setValues((p) => ({ ...p, [k]: v }));
    setErrors((p) => {
      if (!p[k]) return p;
      const n = { ...p };
      delete n[k];
      return n;
    });
  };

  function next() {
    const errs = validateStep(step, values);
    if (Object.keys(errs).length) {
      setErrors(errs);
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setErrors({});
    setMoved(true);
    setStep((s) => Math.min(LAST, s + 1));
  }
  function back() {
    setErrors({});
    setMoved(true);
    setStep((s) => Math.max(0, s - 1));
  }
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Validate every step client-side before the action runs (UX only).
    for (let i = 0; i <= LAST; i++) {
      const errs = validateStep(i, values);
      if (Object.keys(errs).length || (i === 3 && fileError)) {
        e.preventDefault();
        setErrors(errs);
        setMoved(true);
        setStep(i);
        requestAnimationFrame(() => summaryRef.current?.focus());
        return;
      }
    }
  }
  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    const t = e.target as HTMLElement;
    if (e.key === "Enter" && step < LAST && t.tagName === "INPUT" && (t as HTMLInputElement).type !== "submit") {
      e.preventDefault();
      next();
    }
  }
  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > MAX_FILES) return setFileError(`${MAX_FILES} fichiers maximum.`);
    if (files.some((f) => f.size > MAX_BYTES)) return setFileError("Chaque fichier doit faire 4 Mo au maximum.");
    if (files.some((f) => !/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type))) return setFileError("Formats acceptés : JPEG, PNG, WebP ou PDF.");
    setFileError("");
  }
  function onPostalChange(v: string) {
    set("postalCode", v);
    if (!regionTouched && /^\d{5}$/.test(v)) set("region", regionFromInput(undefined, v) ?? "");
  }

  if (state.status === "success") {
    return (
      <div role="status" className="border border-charcoal/25 bg-white p-8 sm:p-12">
        <p className="eyebrow">Demande envoyée</p>
        <h2 ref={doneRef} tabIndex={-1} className="display h-section mt-4 outline-none">
          Merci, votre demande nous est bien parvenue.
        </h2>
        <p className="lead mt-5">
          Nous étudions les informations transmises et revenons vers vous pour échanger sur votre projet. Aucun engagement n’est pris à ce stade.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/notre-methode" className="btn btn-primary">
            Notre méthode
          </Link>
          <Link href="/" className="btn btn-outline">
            Retour à l’accueil
          </Link>
        </div>
      </div>
    );
  }

  const errorEntries = Object.entries(errors);
  const regionGuess = /^\d{5}$/.test(values.postalCode) ? regionFromInput(undefined, values.postalCode) : null;
  const e = errors;

  return (
    <form action={formAction} onSubmit={onSubmit} onKeyDown={onKeyDown} onFocusCapture={() => setStartedAt((s) => s || String(Date.now()))} noValidate aria-labelledby="devis-titre">
      <noscript>
        <style>{`.quote-step[hidden]{display:block!important}.quote-ui{display:none!important}.quote-submit{display:inline-flex!important}`}</style>
      </noscript>

      {/* anti-spam */}
      <div className="hp-field" aria-hidden="true">
        <label>
          Ne pas remplir ce champ
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <input type="hidden" name="formStartedAt" value={startedAt} />
      {source && <input type="hidden" name="source" value={source} />}

      <div className="quote-ui mb-10">
        <p className="flex items-baseline justify-between text-sm">
          <span className="eyebrow">
            Étape {step + 1} sur {STEPS.length}
          </span>
          <span className="text-charcoal/75">{STEPS[step]!.title}</span>
        </p>
        <div className="progress-track mt-3" aria-hidden="true">
          <div className="progress-bar" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <p className="sr-only" aria-live="polite">
          Étape {step + 1} sur {STEPS.length} : {STEPS[step]!.title}
        </p>
      </div>

      <div ref={summaryRef} tabIndex={-1} role={errorEntries.length || state.status === "error" ? "alert" : undefined} className="outline-none">
        {(errorEntries.length > 0 || (state.status === "error" && state.message)) && (
          <div className="mb-8 border-l-4 border-[#8f2b1f] bg-white p-5">
            <p className="font-medium text-[#8f2b1f]">{state.status === "error" && state.message && errorEntries.length === 0 ? state.message : "Merci de corriger les champs indiqués."}</p>
            {errorEntries.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {errorEntries.map(([k, m]) => (
                  <li key={k}>{m}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Step 1 */}
      <section className="quote-step" hidden={step !== 0} aria-labelledby="s1">
        <h2 id="s1" ref={(el) => void (headingRefs.current[0] = el)} tabIndex={-1} className="display h-section mb-8 outline-none">
          Quel est votre projet ?
        </h2>
        <Choices name="projectType" legend="Type de projet" options={PROJECT_TYPES} value={values.projectType} onChange={(v) => set("projectType", v)} error={e.projectType} columns="sm:grid-cols-2 lg:grid-cols-3" />
      </section>

      {/* Step 2 */}
      <section className="quote-step mt-12 [&[hidden]]:mt-0" hidden={step !== 1} aria-labelledby="s2">
        <h2 id="s2" ref={(el) => void (headingRefs.current[1] = el)} tabIndex={-1} className="display h-section mb-8 outline-none">
          Où se situe le projet ?
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="postalCode">
              Code postal
            </label>
            <input id="postalCode" name="postalCode" className="field" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={values.postalCode} onChange={(ev) => onPostalChange(ev.target.value.replace(/\D/g, ""))} aria-invalid={e.postalCode ? true : undefined} aria-describedby={e.postalCode ? "postalCode-err" : undefined} />
            <FieldError id="postalCode-err" msg={e.postalCode} />
          </div>
          <div>
            <label className="field-label" htmlFor="city">
              Ville <span className="font-normal text-charcoal/70">(facultatif)</span>
            </label>
            <input id="city" name="city" className="field" autoComplete="address-level2" value={values.city} onChange={(ev) => set("city", ev.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="region">
              Zone
            </label>
            <select id="region" name="region" className="field" value={values.region} onChange={(ev) => (setRegionTouched(true), set("region", ev.target.value))} aria-describedby="region-hint">
              <option value="">Déterminée d’après le code postal</option>
              {Object.entries(LEAD_REGIONS).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
            <p id="region-hint" className="mt-2 text-sm text-charcoal/75">
              {regionGuess ? `Zone détectée : ${LEAD_REGIONS[regionGuess]}. Vous pouvez la modifier.` : "Nous intervenons en Île-de-France, en Normandie et dans la Manche."}
            </p>
          </div>
        </div>
      </section>

      {/* Step 3 */}
      <section className="quote-step mt-12 [&[hidden]]:mt-0" hidden={step !== 2} aria-labelledby="s3">
        <h2 id="s3" ref={(el) => void (headingRefs.current[2] = el)} tabIndex={-1} className="display h-section mb-8 outline-none">
          Budget et calendrier
        </h2>
        <div className="space-y-10">
          <Choices name="budgetRange" legend="Budget envisagé (facultatif)" hint="Une fourchette indicative suffit : elle nous aide à cadrer l’échange, sans vous engager." options={BUDGET_RANGES} value={values.budgetRange} onChange={(v) => set("budgetRange", v)} error={e.budgetRange} columns="sm:grid-cols-2" />
          <Choices name="desiredTimeline" legend="Délai souhaité pour démarrer (facultatif)" options={TIMELINES} value={values.desiredTimeline} onChange={(v) => set("desiredTimeline", v)} error={e.desiredTimeline} columns="sm:grid-cols-2" />
          <div className="max-w-sm">
            <label className="field-label" htmlFor="desiredStartDate">
              Date de début souhaitée <span className="font-normal text-charcoal/70">(facultatif)</span>
            </label>
            <input id="desiredStartDate" name="desiredStartDate" type="date" className="field" value={values.desiredStartDate} onChange={(ev) => set("desiredStartDate", ev.target.value)} />
          </div>
        </div>
      </section>

      {/* Step 4 */}
      <section className="quote-step mt-12 [&[hidden]]:mt-0" hidden={step !== 3} aria-labelledby="s4">
        <h2 id="s4" ref={(el) => void (headingRefs.current[3] = el)} tabIndex={-1} className="display h-section mb-8 outline-none">
          Décrivez votre projet
        </h2>
        <label className="field-label" htmlFor="message">
          Description
        </label>
        <textarea id="message" name="message" rows={7} className="field" value={values.message} onChange={(ev) => set("message", ev.target.value)} aria-invalid={e.message ? true : undefined} aria-describedby={`message-hint${e.message ? " message-err" : ""}`} />
        <p id="message-hint" className="mt-2 text-sm text-charcoal/75">
          Nature des travaux, surface approximative, contraintes connues, envies… (10 caractères minimum).
        </p>
        <FieldError id="message-err" msg={e.message} />
        {attachmentsEnabled && (
          <div className="mt-8">
            <label className="field-label" htmlFor="attachments">
              Photos ou plans <span className="font-normal text-charcoal/70">(facultatif)</span>
            </label>
            <input id="attachments" name="attachments" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onFiles} className="field py-3" aria-describedby="att-hint att-err" />
            <p id="att-hint" className="mt-2 text-sm text-charcoal/75">
              JPEG, PNG, WebP ou PDF — {MAX_FILES} fichiers maximum, 4 Mo chacun.
            </p>
            <FieldError id="att-err" msg={fileError || e.attachments} />
          </div>
        )}
      </section>

      {/* Step 5 */}
      <section className="quote-step mt-12 [&[hidden]]:mt-0" hidden={step !== 4} aria-labelledby="s5">
        <h2 id="s5" ref={(el) => void (headingRefs.current[4] = el)} tabIndex={-1} className="display h-section mb-8 outline-none">
          Comment vous joindre ?
        </h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="name">
              Nom et prénom
            </label>
            <input id="name" name="name" className="field" autoComplete="name" value={values.name} onChange={(ev) => set("name", ev.target.value)} aria-invalid={e.name ? true : undefined} aria-describedby={e.name ? "name-err" : undefined} />
            <FieldError id="name-err" msg={e.name} />
          </div>
          <div>
            <label className="field-label" htmlFor="email">
              Adresse e-mail
            </label>
            <input id="email" name="email" type="email" className="field" autoComplete="email" value={values.email} onChange={(ev) => set("email", ev.target.value)} aria-invalid={e.email ? true : undefined} aria-describedby={e.email ? "email-err" : undefined} />
            <FieldError id="email-err" msg={e.email} />
          </div>
          <div>
            <label className="field-label" htmlFor="phone">
              Téléphone <span className="font-normal text-charcoal/70">(facultatif)</span>
            </label>
            <input id="phone" name="phone" type="tel" className="field" autoComplete="tel" value={values.phone} onChange={(ev) => set("phone", ev.target.value)} aria-invalid={e.phone ? true : undefined} aria-describedby={e.phone ? "phone-err" : undefined} />
            <FieldError id="phone-err" msg={e.phone} />
          </div>
        </div>
        <div className="mt-8 border border-charcoal/25 bg-white p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="consent" className="mt-1 h-6 w-6 flex-none accent-[#303030]" checked={values.consent} onChange={(ev) => set("consent", ev.target.checked)} aria-invalid={e.consent ? true : undefined} aria-describedby={`consent-notice${e.consent ? " consent-err" : ""}`} />
            <span>{CONSENT_CHECKBOX_LABEL}</span>
          </label>
          <FieldError id="consent-err" msg={e.consent} />
          <p id="consent-notice" className="mt-4 text-sm leading-relaxed text-charcoal/80">
            {PRIVACY_NOTICE_SHORT}{" "}
            <Link href="/politique-de-confidentialite" className="link-line font-medium">
              Lire la politique de confidentialité
            </Link>
            .
          </p>
        </div>
      </section>

      <div className="mt-10 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" onClick={back} className={`quote-ui btn btn-outline ${step === 0 ? "invisible" : ""}`} disabled={step === 0} aria-hidden={step === 0}>
          Retour
        </button>
        {step < LAST ? (
          <button type="button" onClick={next} className="quote-ui btn btn-primary">
            Continuer
          </button>
        ) : null}
        <button type="submit" className={`quote-submit btn btn-primary ${step < LAST ? "hidden" : ""}`} disabled={pending} aria-disabled={pending}>
          {pending ? "Envoi en cours…" : "Envoyer ma demande"}
        </button>
      </div>
    </form>
  );
}
