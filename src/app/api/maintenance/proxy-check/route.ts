import { checkMaintenanceToken } from "@/lib/security/maintenance-token";
import { getClientIp, trustedHops } from "@/lib/security/ip";
import { serverEnv } from "@/lib/config/env";

/**
 * Token-protected diagnostic for the reverse-proxy/IP setup (owner: architect-security). Used ONCE after the
 * first Hostinger deployment to prove which address the app derives for the caller:
 *   curl -fsS -X POST -H "Authorization: Bearer $MAINTENANCE_TOKEN" https://btnv.fr/api/maintenance/proxy-check
 * Returns the caller's own derived IP, the length of X-Forwarded-For and the active settings. 404 without MAINTENANCE_TOKEN.
 */
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };

export async function POST(request: Request) {
  const auth = checkMaintenanceToken(request.headers.get("authorization"));
  if (auth === "disabled") return new Response(null, { status: 404, headers });
  if (auth === "denied") return new Response(null, { status: 401, headers });
  const xff = request.headers.get("x-forwarded-for");
  return Response.json(
    {
      trustProxy: serverEnv().TRUST_PROXY,
      hops: trustedHops(),
      clientIpHeader: process.env.CLIENT_IP_HEADER ?? null,
      xffEntries: xff ? xff.split(",").length : 0,
      xRealIpPresent: request.headers.has("x-real-ip"),
      cfConnectingIpPresent: request.headers.has("cf-connecting-ip"),
      derivedIp: getClientIp(request.headers),
      forwardedProto: request.headers.get("x-forwarded-proto"),
    },
    { headers },
  );
}

export function GET() {
  return new Response(null, { status: 404, headers });
}
