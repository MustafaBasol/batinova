"use client";
// Owner: architect-security.
import { useActionState } from "react";
import { loginAction, type LoginFormState } from "@/lib/auth/actions";

const initial: LoginFormState = { error: null };

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(loginAction, initial);
  return (
    <form action={action} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-charcoal">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-describedby={state.error ? "login-error" : undefined}
          maxLength={254}
          className="min-h-11 w-full border border-charcoal/40 bg-white px-3 py-2 text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-charcoal">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          className="min-h-11 w-full border border-charcoal/40 bg-white px-3 py-2 text-charcoal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal"
        />
      </div>
      <div aria-live="polite" className="min-h-6">
        {state.error ? (
          <p id="login-error" role="alert" className="border-l-2 border-red-700 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full bg-charcoal py-2 text-sm font-medium uppercase tracking-[0.14em] text-offwhite hover:bg-charcoal/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-charcoal disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
