import type { ZodError } from "zod";

/** Uniform Server Action result (owner: cms-admin). Serialisable. */
export type ActionResult<T = void> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Business-rule failure that is safe to show to the user (French message). */
export class CmsError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "CmsError";
  }
}

export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.map(String).join(".") || "form";
    out[k] ??= i.message;
  }
  return out;
}

export function parseOrThrow<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: ZodError } }, value: unknown): T {
  const res = schema.safeParse(value);
  if (!res.success) throw new CmsError("Merci de corriger les champs indiqués.", zodFieldErrors(res.error));
  return res.data;
}

/** Runs post-authorisation work and converts errors to an ActionResult. Never leaks internals. */
export async function runAction<T = void>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, message, data: data === undefined ? undefined : data };
  } catch (err) {
    if (err instanceof CmsError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    if (err && typeof err === "object" && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_")) throw err;
    if (err instanceof Error && err.name === "MediaError") return { ok: false, error: err.message };
    console.error("[admin] action failed:", err instanceof Error ? err.name : "error");
    return { ok: false, error: "Une erreur est survenue. Réessayez ; si le problème persiste, contactez le support." };
  }
}
