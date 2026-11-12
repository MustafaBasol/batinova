// Media upload / replace endpoint (owner: cms-admin).
// Order matters: auth -> same-origin -> rate limit -> size gate BEFORE buffering -> parse -> pipeline.
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { LICENSE_TYPES } from "@/lib/cms/constants";
import { createMediaFromBuffer, replaceMediaFile, MediaError } from "@/lib/media/service";
import { ForbiddenOriginError, assertSameOrigin } from "@/lib/security/origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { MAX_MEDIA_UPLOAD_BYTES } from "@/lib/storage/mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: HEADERS });
const OVERHEAD = 256 * 1024; // multipart framing + text fields

export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("EDITOR", { mode: "throw" });
    assertSameOrigin(request);
  } catch (err) {
    if (err instanceof ForbiddenOriginError) return json({ error: "Origine refusée." }, 403);
    return authErrorResponse(err);
  }
  const rl = await rateLimit(`upload:${user.id}`, 120, 10 * 60 * 1000);
  if (!rl.allowed) return json({ error: "Trop d’envois. Réessayez dans quelques minutes." }, 429);

  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) return json({ error: "Taille de l’envoi inconnue." }, 411);
  if (length > MAX_MEDIA_UPLOAD_BYTES + OVERHEAD) return json({ error: "Fichier trop volumineux (15 Mo maximum)." }, 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Envoi illisible." }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "Aucun fichier reçu." }, 400);
  if (file.size > MAX_MEDIA_UPLOAD_BYTES) return json({ error: "Fichier trop volumineux (15 Mo maximum)." }, 413);

  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const replaceId = text("replaceId");
    if (replaceId) {
      const media = await replaceMediaFile(replaceId, buffer, user.id, file.type || null);
      return json({ ok: true, media: { id: media.id, storageKey: media.storageKey } });
    }
    const lt = text("licenseType");
    const media = await createMediaFromBuffer({
      buffer,
      originalName: file.name,
      alt: text("alt"),
      caption: text("caption") || null,
      credit: text("credit") || null,
      licenseType: (LICENSE_TYPES as readonly string[]).includes(lt) ? (lt as (typeof LICENSE_TYPES)[number]) : "UNKNOWN",
      licenseSource: text("licenseSource") || null,
      licenseNotes: text("licenseNotes") || null,
      isPlaceholder: text("isPlaceholder") === "true",
      uploadedById: user.id,
      declaredMime: file.type || null,
    });
    return json({ ok: true, media: { id: media.id, storageKey: media.storageKey, alt: media.alt, width: media.width, height: media.height } }, 201);
  } catch (err) {
    if (err instanceof MediaError) return json({ error: err.message }, err.code === "not_found" ? 404 : 422);
    console.error("[media] upload failed:", err instanceof Error ? err.name : "error");
    return json({ error: "Échec du traitement de l’image." }, 500);
  }
}
