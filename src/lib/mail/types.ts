/** Mail contract (owner: architect-security). */
export interface MailMessage {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

export type MailResult =
  | { state: "SENT"; messageId?: string }
  | { state: "FAILED"; error: string }
  | { state: "NOT_CONFIGURED" };

export interface Mailer {
  readonly name: "disabled" | "smtp" | "memory";
  readonly enabled: boolean;
  send(message: MailMessage): Promise<MailResult>;
}

/** Removes credentials / addresses / newlines and truncates to 300 chars. */
export function sanitizeMailError(err: unknown): string {
  const raw = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\s@]+@[^\s@]+/g, "[adresse]")
    .replace(/(pass(word)?|pwd|auth|user(name)?)\s*[=:]\s*\S+/gi, "$1=[masqué]")
    .slice(0, 300);
}
