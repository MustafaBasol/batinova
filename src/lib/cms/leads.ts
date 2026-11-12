import { z } from "zod";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import { BUDGET_RANGES, LEAD_STATUS_LABELS, PROJECT_TYPES, TIMELINES } from "@/lib/leads/options";
import { deliverLeadNotification } from "@/lib/leads/service";
import { extendLeadRetention } from "@/lib/leads/retention";
import { audit } from "@/lib/security/audit";
import { getPrivateStorage } from "@/lib/storage";
import { LEAD_STATUSES, REGIONS } from "./constants";
import { toCsv } from "./csv";
import { CmsError, parseOrThrow } from "./result";

/** Lead inbox (owner: cms-admin). Read/status/notes/resend = EDITOR+; export, anonymise, delete = OWNER. */

export const LeadFiltersSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  region: z.enum(REGIONS).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type LeadFilters = z.infer<typeof LeadFiltersSchema>;
export const LEADS_PER_PAGE = 25;

function whereOf(f: Omit<LeadFilters, "page">): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { deletedAt: null };
  if (f.status) where.status = f.status;
  if (f.region) where.region = f.region;
  if (f.from || f.to) {
    where.createdAt = {
      ...(f.from ? { gte: new Date(`${f.from}T00:00:00.000Z`) } : {}),
      ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}),
    };
  }
  if (f.q) where.OR = [{ name: { contains: f.q } }, { email: { contains: f.q } }, { postalCode: { contains: f.q } }, { city: { contains: f.q } }];
  return where;
}

export async function listLeads(filters: LeadFilters) {
  const where = whereOf(filters);
  const [items, total] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * LEADS_PER_PAGE,
      take: LEADS_PER_PAGE,
      select: { id: true, name: true, email: true, postalCode: true, city: true, region: true, projectType: true, status: true, mailDeliveryState: true, createdAt: true, _count: { select: { attachments: true } } },
    }),
    db.lead.count({ where }),
  ]);
  return { items, total, pageCount: Math.max(1, Math.ceil(total / LEADS_PER_PAGE)) };
}

export const LeadStatusSchema = z.object({ id: z.string().max(64), status: z.enum(LEAD_STATUSES) });

export async function setLeadStatus(actor: SessionUser, raw: unknown): Promise<void> {
  const { id, status } = parseOrThrow(LeadStatusSchema, raw);
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead || lead.deletedAt) throw new CmsError("Demande introuvable.");
  await db.lead.update({ where: { id }, data: { status } });
  if (status !== "SPAM" && status !== "ARCHIVED") await extendLeadRetention(id); // new contact => retention restarts
  await audit(actor.id, "lead.status", { type: "Lead", id }, { status });
}

export const LeadNotesSchema = z.object({ id: z.string().max(64), notes: z.string().max(5000) });

export async function saveLeadNotes(actor: SessionUser, raw: unknown): Promise<void> {
  const { id, notes } = parseOrThrow(LeadNotesSchema, raw);
  const lead = await db.lead.findUnique({ where: { id }, select: { id: true, deletedAt: true } });
  if (!lead || lead.deletedAt) throw new CmsError("Demande introuvable.");
  await db.lead.update({ where: { id }, data: { internalNotes: notes.trim() || null } });
  await audit(actor.id, "lead.notes", { type: "Lead", id }); // note content is never logged
}

export async function resendLeadNotification(actor: SessionUser, id: string): Promise<"SENT" | "FAILED" | "NOT_CONFIGURED"> {
  const res = await deliverLeadNotification(id, actor.id);
  if (!res) throw new CmsError("Demande introuvable.");
  return res;
}

const label = (map: Record<string, string>, k: string | null) => (k ? (map[k] ?? k) : "");

export async function exportLeadsCsv(actor: SessionUser, filters: Omit<LeadFilters, "page"> = {}): Promise<string> {
  if (actor.role !== "OWNER") throw new CmsError("Export réservé au propriétaire.");
  const rows = await db.lead.findMany({ where: whereOf(filters), orderBy: { createdAt: "desc" }, take: 5000 });
  await audit(actor.id, "lead.export", { type: "Lead" }, { count: rows.length });
  return toCsv(
    ["Date", "Statut", "Nom", "E-mail", "Téléphone", "Code postal", "Ville", "Région", "Type de projet", "Budget", "Délai", "Début souhaité", "Source", "Notification e-mail", "Consentement (date)", "Version du texte"],
    rows.map((l) => [
      l.createdAt, LEAD_STATUS_LABELS[l.status], l.name, l.email, l.phone, l.postalCode, l.city, l.region,
      label(PROJECT_TYPES, l.projectType), label(BUDGET_RANGES, l.budgetRange), label(TIMELINES, l.desiredTimeline),
      l.desiredStartDate, l.source, l.mailDeliveryState, l.consentAt, l.consentTextVersion,
    ]),
  );
}

async function removeAttachments(leadId: string) {
  const files = await db.leadAttachment.findMany({ where: { leadId }, select: { storageKey: true } });
  const storage = getPrivateStorage();
  for (const f of files) await storage.delete(f.storageKey).catch(() => undefined);
  await db.leadAttachment.deleteMany({ where: { leadId } });
}

/** RGPD erasure: row and files are removed immediately (OWNER). */
export async function deleteLeadPermanently(actor: SessionUser, id: string): Promise<void> {
  if (actor.role !== "OWNER") throw new CmsError("Réservé au propriétaire.");
  const lead = await db.lead.findUnique({ where: { id }, select: { id: true } });
  if (!lead) throw new CmsError("Demande introuvable.");
  await removeAttachments(id);
  await db.lead.delete({ where: { id } });
  await audit(actor.id, "lead.delete", { type: "Lead", id });
}

/** Keeps anonymous statistics (date, region, project type, status) and erases every identifying field. */
export async function anonymiseLead(actor: SessionUser, id: string): Promise<void> {
  if (actor.role !== "OWNER") throw new CmsError("Réservé au propriétaire.");
  const lead = await db.lead.findUnique({ where: { id }, select: { id: true } });
  if (!lead) throw new CmsError("Demande introuvable.");
  await removeAttachments(id);
  await db.lead.update({
    where: { id },
    data: {
      name: "Anonymisé", email: "anonyme@invalid", phone: null, city: null, message: "[supprimé]", internalNotes: null,
      postalCode: "00000", ipHash: null, userAgent: null, desiredStartDate: null, lastMailError: null,
    },
  });
  await audit(actor.id, "lead.anonymise", { type: "Lead", id });
}
