// Public media delivery (owner: architect-security).
// Serves ONLY the public storage root (MEDIA_STORAGE_DIR). Lead attachments live
// in PRIVATE_STORAGE_DIR and are unreachable from here by construction.
// Only raster image types are served; anything else is a 404.
import { getPublicStorage, isValidStorageKey } from "@/lib/storage";
import { isRasterImageMime, mimeFromKey } from "@/lib/storage/mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isValidStorageKey(key)) return notFound();
  const mime = mimeFromKey(key);
  if (!isRasterImageMime(mime)) return notFound();

  const obj = await getPublicStorage().getStream(key);
  if (!obj) return notFound();

  return new Response(obj.stream, {
    status: 200,
    headers: {
      "Content-Type": mime,
      "Content-Length": String(obj.size),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      // keys are content-addressed / random and never reused -> immutable
      "Cache-Control": "public, max-age=31536000, immutable",
      "Cross-Origin-Resource-Policy": "same-site",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

export async function HEAD(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const res = await GET(req, ctx);
  await res.body?.cancel();
  return new Response(null, { status: res.status, headers: res.headers });
}
