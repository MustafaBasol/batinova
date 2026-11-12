// JSON list for the media picker (owner: cms-admin). EDITOR+.
import { z } from "zod";
import { db } from "@/lib/db";
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { mediaUrl } from "@/lib/content/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  q: z.string().trim().max(80).optional(),
  ids: z.string().max(2000).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export async function GET(request: Request) {
  try {
    await requireRole("EDITOR", { mode: "throw" });
  } catch (err) {
    return authErrorResponse(err);
  }
  const url = new URL(request.url);
  const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return Response.json({ error: "Requête invalide" }, { status: 400 });
  const { q, ids, page } = parsed.data;
  const idList = ids ? ids.split(",").filter((i) => /^[A-Za-z0-9_-]{1,64}$/.test(i)).slice(0, 60) : null;
  const where = {
    deletedAt: null,
    ...(idList ? { id: { in: idList } } : {}),
    ...(q ? { OR: [{ alt: { contains: q } }, { originalName: { contains: q } }, { caption: { contains: q } }] } : {}),
  };
  const rows = await db.media.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 36, take: 36 });
  return Response.json(
    {
      items: rows.map((m) => ({
        id: m.id,
        url: mediaUrl(m.storageKey),
        alt: m.alt,
        originalName: m.originalName,
        width: m.width,
        height: m.height,
        isPlaceholder: m.isPlaceholder,
      })),
      hasMore: rows.length === 36,
    },
    { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } },
  );
}
