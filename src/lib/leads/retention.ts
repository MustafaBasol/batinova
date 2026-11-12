import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/security/audit";
import { getSettings } from "@/lib/settings";
import { InvalidStorageKeyError, getPrivateStorage } from "@/lib/storage";

/**
 * Lead lifecycle & retention (owner: architect-security). See docs/ARCHITECTURE.md §Leads.
 *  - retentionUntil = createdAt + leads.retentionDays (default 1095 d, TO CONFIRM).
 *  - Status changes / new contact can extend it via extendLeadRetention().
 *  - SPAM leads: purged after leads.spamRetentionDays.
 *  - Soft-deleted (deletedAt) leads: purged after 30 days.
 *  - Purge = hard delete of the row + private attachment files.
 * Run purgeExpiredLeads() from a scheduled job (e.g. daily `npm run maintenance`)
 * or an OWNER-triggered admin action.
 */
export const SOFT_DELETE_GRACE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export async function extendLeadRetention(leadId: string, now: Date = new Date()) {
  const { leads } = await getSettings();
  await db.lead.update({ where: { id: leadId }, data: { retentionUntil: new Date(now.getTime() + leads.retentionDays * DAY) } });
}

export async function purgeExpiredLeads(now: Date = new Date(), actorId: string | null = null): Promise<number> {
  const { leads } = await getSettings();
  const expired = await db.lead.findMany({
    where: {
      OR: [
        { retentionUntil: { lte: now } },
        { status: "SPAM", createdAt: { lte: new Date(now.getTime() - leads.spamRetentionDays * DAY) } },
        { deletedAt: { lte: new Date(now.getTime() - SOFT_DELETE_GRACE_DAYS * DAY) } },
      ],
    },
    select: { id: true, attachments: { select: { storageKey: true } } },
    take: 500,
  });
  const storage = getPrivateStorage();
  let purged = 0;
  let deferred = 0;
  for (const lead of expired) {
    // Files first. If a file cannot be removed (I/O error) keep the row so the next run retries,
    // otherwise the file would be orphaned forever with no DB reference left to find it.
    // A malformed key can never be resolved on disk, so it must not block the purge.
    let filesGone = true;
    for (const a of lead.attachments) {
      try {
        await storage.delete(a.storageKey);
      } catch (err) {
        if (!(err instanceof InvalidStorageKeyError)) filesGone = false;
      }
    }
    if (!filesGone) {
      deferred++;
      continue;
    }
    await db.lead.delete({ where: { id: lead.id } });
    purged++;
  }
  if (deferred) console.error(`[retention] ${deferred} lead(s) deferred: attachment file could not be deleted`);
  if (purged) await audit(actorId, "lead.purge", { type: "Lead" }, { count: purged, deferred });
  return purged;
}
