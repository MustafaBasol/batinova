import "server-only";
import { db } from "@/lib/db";
import { getMailer } from "@/lib/mail";
import { sanitizeMailError } from "@/lib/mail/types";
import { audit } from "@/lib/security/audit";
import { hashIdentifier, hashIp, truncateUserAgent } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/rate-limit";
import { getSettings } from "@/lib/settings";
import { generateStorageKey, getPrivateStorage, sanitizeOriginalName } from "@/lib/storage";
import {
  ATTACHMENT_MIME,
  EXTENSION_BY_MIME,
  MAX_ATTACHMENTS_PER_LEAD,
  MAX_ATTACHMENT_BYTES,
  sniffMime,
} from "@/lib/storage/mime";
import { BUDGET_RANGES, PROJECT_TYPES, TIMELINES } from "./options";
import { LeadInputSchema, regionFromInput } from "./schema";

/**
 * Lead intake & notification (owner: architect-security).
 * Order of operations guarantees a lead is NEVER lost to a mail failure:
 *   validate -> spam checks -> rate limit -> SAVE lead (+ private attachments)
 *   -> try notification -> record mailDeliveryState/mailAttempts/lastMailError.
 * The public form's Server Action (design-frontend) only calls submitLead().
 */
export const LEAD_IP_LIMIT = 5;
export const LEAD_EMAIL_LIMIT = 3;
export const LEAD_WINDOW_MS = 60 * 60 * 1000;
export const MIN_FILL_MS = 3000;

export interface LeadContext {
  ip: string;
  userAgent?: string | null;
  now?: Date;
}

export interface UploadedFileInput {
  name: string;
  bytes: Uint8Array;
}

export type SubmitLeadResult =
  | { ok: true; leadId: string | null } // null when silently discarded as spam
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const GENERIC_ERROR = "Votre demande n’a pas pu être envoyée. Veuillez réessayer.";
const THROTTLED_ERROR = "Trop de demandes envoyées. Merci de réessayer plus tard.";

export async function submitLead(
  raw: Record<string, unknown>,
  ctx: LeadContext,
  files: UploadedFileInput[] = [],
): Promise<SubmitLeadResult> {
  const now = ctx.now ?? new Date();
  const parsed = LeadInputSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = String(issue.path[0] ?? "form");
      fieldErrors[k] ??= issue.message;
    }
    return { ok: false, error: "Merci de corriger les champs indiqués.", fieldErrors };
  }
  const input = parsed.data;

  // Spam: honeypot or implausibly fast submission -> pretend success, store nothing.
  const tooFast = input.formStartedAt !== undefined && now.getTime() - input.formStartedAt < MIN_FILL_MS;
  if (input.website.trim() !== "" || tooFast) {
    await audit(null, "lead.spam_discarded", null, { reason: input.website ? "honeypot" : "too_fast" });
    return { ok: true, leadId: null };
  }

  const ipHash = hashIp(ctx.ip);
  const [ipRes, emailRes] = await Promise.all([
    rateLimit(`lead:ip:${ipHash}`, LEAD_IP_LIMIT, LEAD_WINDOW_MS, now),
    rateLimit(`lead:email:${hashIdentifier("email", input.email)}`, LEAD_EMAIL_LIMIT, LEAD_WINDOW_MS, now),
  ]);
  if (!ipRes.allowed || !emailRes.allowed) return { ok: false, error: THROTTLED_ERROR };

  const settings = await getSettings();

  // Validate attachments BEFORE saving anything.
  const accepted: { name: string; bytes: Uint8Array; mime: string }[] = [];
  if (files.length > 0) {
    if (!settings.leads.attachmentsEnabled) return { ok: false, error: "Les pièces jointes ne sont pas acceptées." };
    if (files.length > MAX_ATTACHMENTS_PER_LEAD)
      return { ok: false, error: `${MAX_ATTACHMENTS_PER_LEAD} pièces jointes maximum.` };
    for (const f of files) {
      if (f.bytes.byteLength === 0) continue;
      if (f.bytes.byteLength > MAX_ATTACHMENT_BYTES) return { ok: false, error: "Pièce jointe trop volumineuse (4 Mo max)." };
      const mime = sniffMime(f.bytes);
      if (!mime || !(ATTACHMENT_MIME as readonly string[]).includes(mime))
        return { ok: false, error: "Format de pièce jointe non accepté (JPEG, PNG, WebP ou PDF)." };
      accepted.push({ name: sanitizeOriginalName(f.name), bytes: f.bytes, mime });
    }
  }

  const retentionUntil = new Date(now.getTime() + settings.leads.retentionDays * 24 * 60 * 60 * 1000);
  let leadId: string;
  const storedKeys: string[] = [];
  try {
    const lead = await db.lead.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        postalCode: input.postalCode,
        city: input.city ?? null,
        region: regionFromInput(input.region, input.postalCode),
        projectType: input.projectType,
        message: input.message,
        budgetRange: input.budgetRange ?? null,
        desiredTimeline: input.desiredTimeline ?? null,
        desiredStartDate: input.desiredStartDate ?? null,
        source: input.source ?? null,
        consentAt: now,
        consentTextVersion: settings.leads.consentTextVersion,
        ipHash,
        userAgent: truncateUserAgent(ctx.userAgent),
        retentionUntil,
        createdAt: now,
      },
    });
    leadId = lead.id;
    const storage = getPrivateStorage();
    for (const a of accepted) {
      const ext = EXTENSION_BY_MIME[a.mime] ?? "bin";
      const key = `leads/${generateStorageKey(ext, { now })}`;
      await storage.put(key, a.bytes, a.mime);
      storedKeys.push(key);
      await db.leadAttachment.create({
        data: {
          leadId,
          storageKey: key,
          originalName: a.name,
          mime: a.mime,
          sizeBytes: a.bytes.byteLength,
          kind: a.mime === "application/pdf" ? "DOCUMENT" : "IMAGE",
        },
      });
    }
  } catch (err) {
    console.error("[lead] save failed", err instanceof Error ? err.name : "error");
    return { ok: false, error: GENERIC_ERROR };
  }

  await audit(null, "lead.create", { type: "Lead", id: leadId }, { attachments: storedKeys.length });
  await deliverLeadNotification(leadId);
  return { ok: true, leadId };
}

/**
 * Sends (or re-sends — admin "renvoyer") the internal notification for a lead
 * and records the outcome. Never throws. Caller must authorize admin re-sends.
 */
export async function deliverLeadNotification(leadId: string, actorId: string | null = null) {
  const lead = await db.lead.findUnique({ where: { id: leadId }, include: { attachments: true } });
  if (!lead || lead.deletedAt) return null;
  const settings = await getSettings();
  const mailer = await getMailer();
  const now = new Date();

  if (!mailer.enabled) {
    await db.lead.update({ where: { id: leadId }, data: { mailDeliveryState: "NOT_CONFIGURED" } });
    return "NOT_CONFIGURED" as const;
  }
  const target = settings.emailRouting[settings.emailRouting.leadNotificationTarget];
  let result;
  try {
    result = await mailer.send({
      to: [target.address],
      replyTo: lead.email,
      subject: `Nouvelle demande de devis — ${PROJECT_TYPES[lead.projectType as keyof typeof PROJECT_TYPES] ?? lead.projectType} (${lead.postalCode})`,
      text: [
        `Nom : ${lead.name}`,
        `E-mail : ${lead.email}`,
        `Téléphone : ${lead.phone ?? "—"}`,
        `Localisation : ${lead.postalCode} ${lead.city ?? ""}`.trim(),
        `Type de projet : ${PROJECT_TYPES[lead.projectType as keyof typeof PROJECT_TYPES] ?? lead.projectType}`,
        `Budget : ${lead.budgetRange ? (BUDGET_RANGES[lead.budgetRange as keyof typeof BUDGET_RANGES] ?? lead.budgetRange) : "—"}`,
        `Délai : ${lead.desiredTimeline ? (TIMELINES[lead.desiredTimeline as keyof typeof TIMELINES] ?? lead.desiredTimeline) : "—"}`,
        `Début souhaité : ${lead.desiredStartDate ?? "—"}`,
        `Pièces jointes : ${lead.attachments.length} (à consulter dans l’administration)`,
        "",
        lead.message,
      ].join("\n"),
    });
  } catch (err) {
    result = { state: "FAILED" as const, error: sanitizeMailError(err) };
  }
  await db.lead.update({
    where: { id: leadId },
    data: {
      mailDeliveryState: result.state,
      mailAttempts: { increment: result.state === "NOT_CONFIGURED" ? 0 : 1 },
      lastMailAttemptAt: now,
      lastMailError: result.state === "FAILED" ? result.error : null,
    },
  });
  if (actorId) await audit(actorId, "lead.resend", { type: "Lead", id: leadId }, { status: result.state });
  return result.state;
}
