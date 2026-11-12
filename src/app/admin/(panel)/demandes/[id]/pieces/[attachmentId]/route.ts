// Lead attachment download (owner: cms-admin). Files live in PRIVATE storage and are
// streamed ONLY here, to an authenticated admin, as a forced download.
import { db } from "@/lib/db";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { audit } from "@/lib/security/audit";
import { getPrivateStorage, isValidStorageKey } from "@/lib/storage";
import { ATTACHMENT_MIME } from "@/lib/storage/mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; attachmentId: string }> }) {
  let user;
  try {
    user = await requireRole("EDITOR", { mode: "throw" });
  } catch (err) {
    return authErrorResponse(err);
  }
  const { id, attachmentId } = await ctx.params;
  if (!ID.test(id) || !ID.test(attachmentId)) return notFound();
  // the attachment must belong to THIS lead and the lead must not be deleted
  const att = await db.leadAttachment.findFirst({ where: { id: attachmentId, leadId: id, lead: { deletedAt: null } } });
  if (!att || !isValidStorageKey(att.storageKey)) return notFound();
  const mime = (ATTACHMENT_MIME as readonly string[]).includes(att.mime) ? att.mime : "application/octet-stream";
  const obj = await getPrivateStorage().getStream(att.storageKey);
  if (!obj) return notFound();
  await audit(user.id, "lead.attachment_download", { type: "Lead", id });
  const safeName = att.originalName.replace(/[^\w.\- ]+/g, "_").slice(0, 100) || "fichier";
  return new Response(obj.stream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(obj.size),
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(att.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
