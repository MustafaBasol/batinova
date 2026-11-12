// Uncropped master (private storage) for the crop tool (owner: cms-admin). EDITOR+.
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { readMediaMaster } from "@/lib/media/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("EDITOR", { mode: "throw" });
  } catch (err) {
    return authErrorResponse(err);
  }
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return new Response("Not found", { status: 404 });
  const bytes = await readMediaMaster(id);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
