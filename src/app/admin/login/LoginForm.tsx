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
        <label htmlFor="email" className="block text-sm text-charcoal mb-1">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={254}
          className="w-full border border-charcoal/30 px-3 py-2 focus:outline-2 focus:outline-beige"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm text-charcoal mb-1">
          Mot de passe
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={256}
          className="w-full border border-charcoal/30 px-3 py-2 focus:outline-2 focus:outline-beige"
        />
      </div>
      <div aria-live="polite" className="min-h-5">
        {state.error ? (
          <p role="alert" className="text-sm text-red-700">
            {state.error}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="w-full bg-charcoal text-offwhite py-2 hover:bg-charcoal/90 disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
