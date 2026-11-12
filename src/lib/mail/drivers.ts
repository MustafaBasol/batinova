import "server-only";
import type { Mailer, MailMessage, MailResult } from "./types";
import { sanitizeMailError } from "./types";

/** Default: never sends; callers record mailDeliveryState = NOT_CONFIGURED. */
export class DisabledMailer implements Mailer {
  readonly name = "disabled" as const;
  readonly enabled = false;
  async send(): Promise<MailResult> {
    return { state: "NOT_CONFIGURED" };
  }
}

/** Test double that records messages in memory. */
export class MemoryMailer implements Mailer {
  readonly name = "memory" as const;
  readonly enabled = true;
  readonly sent: MailMessage[] = [];
  constructor(private readonly fail = false) {}
  async send(message: MailMessage): Promise<MailResult> {
    if (this.fail) return { state: "FAILED", error: "simulated failure" };
    this.sent.push(message);
    return { state: "SENT", messageId: `memory-${this.sent.length}` };
  }
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

/**
 * SMTP via nodemailer (e.g. Hostinger: smtp.hostinger.com:465, secure).
 * Lazily imports nodemailer so it is never loaded when mail is disabled.
 */
export class SmtpMailer implements Mailer {
  readonly name = "smtp" as const;
  readonly enabled = true;
  constructor(private readonly config: SmtpConfig) {}

  async send(message: MailMessage): Promise<MailResult> {
    try {
      const nodemailer = await import("nodemailer");
      const transport = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        requireTLS: !this.config.secure,
        auth: { user: this.config.user, pass: this.config.password },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      const info = await transport.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
        text: message.text,
        replyTo: message.replyTo,
      });
      return { state: "SENT", messageId: typeof info.messageId === "string" ? info.messageId : undefined };
    } catch (err) {
      return { state: "FAILED", error: sanitizeMailError(err) };
    }
  }
}
