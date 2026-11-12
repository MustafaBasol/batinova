"use server";
/**
 * Quote form Server Action (design-frontend). Thin wrapper around submitLead(): all validation, spam
 * handling (honeypot + minimum fill time), rate limiting, attachment checks, persistence and mail
 * fallback live in src/lib/leads/service.ts. No PII is placed in URLs or logs here.
 */
import { headers } from "next/headers";
import { getClientIp } from "@/lib/security/ip";
import { LEAD_FIELDS } from "@/lib/leads/schema";
import { submitLead, type UploadedFileInput } from "@/lib/leads/service";
import { MAX_ATTACHMENTS_PER_LEAD, MAX_ATTACHMENT_BYTES } from "@/lib/storage/mime";

export interface QuoteState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
}

export async function submitQuote(_prev: QuoteState, formData: FormData): Promise<QuoteState> {
  const raw: Record<string, unknown> = {};
  for (const name of LEAD_FIELDS) {
    const v = formData.get(name);
    if (typeof v === "string") raw[name] = v;
  }
  const files: UploadedFileInput[] = [];
  const uploads = formData.getAll("attachments").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (uploads.length > MAX_ATTACHMENTS_PER_LEAD) {
    return { status: "error", message: `${MAX_ATTACHMENTS_PER_LEAD} pièces jointes maximum.`, fieldErrors: { attachments: `${MAX_ATTACHMENTS_PER_LEAD} fichiers maximum.` } };
  }
  // Size gate BEFORE buffering (memory-exhaustion guard); submitLead re-checks the bytes.
  if (uploads.some((f) => f.size > MAX_ATTACHMENT_BYTES)) {
    return { status: "error", message: "Pièce jointe trop volumineuse (4 Mo max).", fieldErrors: { attachments: "4 Mo maximum par fichier." } };
  }
  for (const f of uploads) files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });

  const h = await headers();
  const res = await submitLead(raw, { ip: getClientIp(h), userAgent: h.get("user-agent") }, files);
  if (res.ok) return { status: "success" };
  return { status: "error", message: res.error, fieldErrors: res.fieldErrors };
}
