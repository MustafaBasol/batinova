import { db } from "@/lib/db";

/** Deletes all rows (child tables first). Integration tests call it in beforeEach. */
export async function resetDb(): Promise<void> {
  await db.$transaction([
    db.leadAttachment.deleteMany(),
    db.lead.deleteMany(),
    db.navItem.deleteMany(),
    db.projectMedia.deleteMany(),
    db.projectRevision.deleteMany(),
    db.project.deleteMany(),
    db.postTag.deleteMany(),
    db.postRevision.deleteMany(),
    db.post.deleteMany(),
    db.tag.deleteMany(),
    db.category.deleteMany(),
    db.pageRevision.deleteMany(),
    db.page.deleteMany(),
    db.media.deleteMany(),
    db.redirect.deleteMany(),
    db.setting.deleteMany(),
    db.auditLog.deleteMany(),
    db.session.deleteMany(),
    db.rateLimitBucket.deleteMany(),
    db.user.deleteMany(),
  ]);
}

export { db };
