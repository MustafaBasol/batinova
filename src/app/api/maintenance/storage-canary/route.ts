import { z } from "zod";
import { db } from "@/lib/db";
import { getPrivateStorage, getPublicStorage, storageDriverKind } from "@/lib/storage";
import { CANARY_SETTING, checkCanary, cleanupCanary, cwdHashOf, cycleCanary, writeCanary, type CanaryEntry, type CanaryEnv } from "@/lib/storage/canary";
import { checkMaintenanceToken } from "@/lib/security/maintenance-token";
import { getClientIp, hashIp } from "@/lib/security/ip";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * Token-protected storage persistence canary (owner: architect-security) — the no-shell way to run the Hostinger
 * persistence test (docs/HOSTINGER_PERSISTENCE_TEST.md). Test data only; 404 without MAINTENANCE_TOKEN.
 *   curl -fsS -X POST -H @/path/header -H 'content-type: application/json' -d '{"action":"write"}' https://<test-host>/api/maintenance/storage-canary
 * actions: write | check | cycle | cleanup. Never returns filesystem paths or secrets.
 */
export const dynamic = "force-dynamic";
const headers = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };
const Body = z.object({ action: z.enum(["write", "check", "cycle", "cleanup"]) });

const store = {
  async get(): Promise<CanaryEntry[]> {
    const row = await db.setting.findUnique({ where: { key: CANARY_SETTING } });
    return Array.isArray(row?.value) ? (row.value as unknown as CanaryEntry[]) : [];
  },
  async set(entries: CanaryEntry[]) {
    const value = entries as unknown as object;
    await db.setting.upsert({ where: { key: CANARY_SETTING }, create: { key: CANARY_SETTING, value }, update: { value } });
  },
};

export async function POST(request: Request) {
  const auth = checkMaintenanceToken(request.headers.get("authorization"));
  if (auth === "disabled") return new Response(null, { status: 404, headers });
  if (auth === "denied") {
    const r = await rateLimit(`maintenance:ip:${hashIp(getClientIp(request.headers))}`, 10, 15 * 60_000);
    return new Response(null, { status: r.allowed ? 401 : 429, headers });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, error: "action must be write|check|cycle|cleanup" }, { status: 400, headers });
  const env: CanaryEnv = {
    pub: getPublicStorage(),
    priv: getPrivateStorage(),
    store,
    cwdHash: cwdHashOf(),
    bootedAt: new Date(Date.now() - process.uptime() * 1000),
  };
  try {
    const driver = storageDriverKind();
    switch (parsed.data.action) {
      case "write":
        return Response.json({ ok: true, driver, ...(await writeCanary(env)) }, { headers });
      case "check":
        return Response.json({ driver, ...(await checkCanary(env)) }, { headers });
      case "cycle":
        return Response.json({ driver, ...(await cycleCanary(env)) }, { headers });
      case "cleanup":
        return Response.json({ ok: true, driver, ...(await cleanupCanary(env)) }, { headers });
    }
  } catch {
    return Response.json({ ok: false, error: "canary failed (storage not writable?)" }, { status: 500, headers });
  }
}

export function GET() {
  return new Response(null, { status: 404, headers });
}
