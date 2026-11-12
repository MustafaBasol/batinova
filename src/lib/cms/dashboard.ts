import { db } from "@/lib/db";
import { getMailer } from "@/lib/mail";
import { getSettings } from "@/lib/settings";
import { smtpConfigFromEnv } from "@/lib/mail";

/** Dashboard aggregates (owner: cms-admin). Read-only; the page enforces requireUser(). */
export async function getDashboardData() {
  const now = new Date();
  const [drafts, scheduled, newLeads, recentLeads, placeholderCount, missingAlt, settings, mailer, dueSoon] = await Promise.all([
    Promise.all([
      db.page.count({ where: { status: "DRAFT", deletedAt: null } }),
      db.post.count({ where: { status: "DRAFT", deletedAt: null } }),
      db.project.count({ where: { status: "DRAFT", deletedAt: null } }),
    ]),
    Promise.all([
      db.page.count({ where: { status: "SCHEDULED", deletedAt: null } }),
      db.post.count({ where: { status: "SCHEDULED", deletedAt: null } }),
      db.project.count({ where: { status: "SCHEDULED", deletedAt: null } }),
    ]),
    db.lead.count({ where: { status: "NEW", deletedAt: null } }),
    db.lead.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, projectType: true, postalCode: true, status: true, createdAt: true },
    }),
    Promise.all([
      db.page.count({ where: { isPlaceholder: true, deletedAt: null } }),
      db.post.count({ where: { isPlaceholder: true, deletedAt: null } }),
      db.project.count({ where: { isPlaceholder: true, deletedAt: null } }),
      db.media.count({ where: { isPlaceholder: true, deletedAt: null } }),
    ]),
    db.media.count({ where: { alt: "", deletedAt: null } }),
    getSettings(),
    getMailer(),
    db.lead.count({ where: { retentionUntil: { lte: new Date(now.getTime() + 30 * 86400_000) }, deletedAt: null } }),
  ]);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const companyFields = Object.entries(settings.company) as [string, { value: string; verified: boolean }][];
  return {
    drafts: { pages: drafts[0], posts: drafts[1], projects: drafts[2], total: sum(drafts) },
    scheduled: { pages: scheduled[0], posts: scheduled[1], projects: scheduled[2], total: sum(scheduled) },
    newLeads,
    recentLeads,
    placeholders: { total: sum(placeholderCount), media: placeholderCount[3] },
    missingAlt,
    leadsExpiring: dueSoon,
    mail: {
      enabled: mailer.enabled,
      smtpEnvPresent: smtpConfigFromEnv() !== null,
      settingEnabled: settings.mail.enabled,
    },
    checklist: {
      unverifiedCompany: companyFields.filter(([, f]) => !f.verified).length,
      companyTotal: companyFields.length,
      retentionConfirmed: settings.leads.retentionConfirmed,
      mailboxesProvisioned: (["contact", "devis", "projets", "direction", "privacy"] as const).filter((k) => settings.emailRouting[k].provisioned).length,
      addressVerified: settings.address.source === "owner-verified",
      analyticsEnabled: settings.analytics.enabled,
    },
  };
}
