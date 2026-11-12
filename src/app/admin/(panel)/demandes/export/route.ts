// Lead CSV export (owner: cms-admin). OWNER only, POST + same-origin (CSRF), audited, formula-injection safe.
import { authErrorResponse, requireRole } from "@/lib/auth/guards";
import { CmsError } from "@/lib/cms/result";
import { LeadFiltersSchema, exportLeadsCsv } from "@/lib/cms/leads";
import { ForbiddenOriginError, assertSameOrigin } from "@/lib/security/origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("OWNER", { mode: "throw" });
    assertSameOrigin(request);
  } catch (err) {
    if (err instanceof ForbiddenOriginError) return Response.json({ error: "Origine refusée." }, { status: 403 });
    return authErrorResponse(err);
  }
  const form = await request.formData().catch(() => null);
  const raw: Record<string, string> = {};
  for (const k of ["status", "region", "from", "to", "q"]) {
    const v = form?.get(k);
    if (typeof v === "string" && v) raw[k] = v;
  }
  const filters = LeadFiltersSchema.safeParse(raw);
  try {
    const csv = await exportLeadsCsv(user, filters.success ? { ...filters.data } : {});
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="demandes-${new Date().toISOString().slice(0, 10)}.csv"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof CmsError) return Response.json({ error: err.message }, { status: 403 });
    throw err;
  }
}
