import "server-only";
import { getSetting } from "@/lib/settings";
import { DisabledMailer, SmtpMailer, type SmtpConfig } from "./drivers";
import type { Mailer } from "./types";

export * from "./types";
export { DisabledMailer, MemoryMailer, SmtpMailer } from "./drivers";

/**
 * Mailer selection (owner: architect-security). SMTP is used ONLY when:
 *   1. NODE_ENV !== "test", and
 *   2. SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD and MAIL_FROM are all set, and
 *   3. the admin setting `mail.enabled` is true (OWNER-only).
 * Otherwise DisabledMailer (records NOT_CONFIGURED).
 */
export function smtpConfigFromEnv(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM, SMTP_SECURE } = env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !MAIL_FROM) return null;
  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return {
    host: SMTP_HOST,
    port,
    secure: SMTP_SECURE ? SMTP_SECURE === "true" : port === 465,
    user: SMTP_USER,
    password: SMTP_PASSWORD,
    from: MAIL_FROM,
  };
}

let override: Mailer | null = null;
/** Tests only: force a mailer (e.g. MemoryMailer). Pass null to clear. */
export function setMailerForTests(m: Mailer | null): void {
  override = m;
}

export async function getMailer(): Promise<Mailer> {
  if (override) return override;
  if (process.env.NODE_ENV === "test") return new DisabledMailer();
  const cfg = smtpConfigFromEnv();
  if (!cfg) return new DisabledMailer();
  const mail = await getSetting("mail");
  return mail.enabled ? new SmtpMailer(cfg) : new DisabledMailer();
}
