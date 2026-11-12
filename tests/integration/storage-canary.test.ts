import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalDiskDriver } from "@/lib/storage";
import { S3Driver } from "@/lib/storage/s3";
import { checkCanary, cleanupCanary, cycleCanary, writeCanary, type CanaryEntry, type CanaryEnv, type StorageDriverPair } from "@/lib/storage/canary";
import { POST as canaryPOST, GET as canaryGET } from "@/app/api/maintenance/storage-canary/route";
import { resetStorageDrivers } from "@/lib/storage";
import { startFakeS3, type FakeS3 } from "../support/fake-s3";
import { db, resetDb } from "../support/db";

type Pair = StorageDriverPair;
const base = mkdtempSync(path.join(tmpdir(), "btnv-canary-"));
let s3: FakeS3;
beforeAll(async () => {
  s3 = await startFakeS3();
});
afterAll(async () => {
  rmSync(base, { recursive: true, force: true });
  await s3.close();
});

function memStore() {
  let entries: CanaryEntry[] = [];
  return { get: async () => entries, set: async (e: CanaryEntry[]) => void (entries = e) };
}
const dep = (store: CanaryEnv["store"], pair: Pair, cwdHash: string, boot: string, now: string): CanaryEnv => ({ ...pair, store, cwdHash, bootedAt: new Date(boot), now: new Date(now) });

const drivers: [string, () => Pair][] = [
  ["local disk", () => {
    const d = mkdtempSync(path.join(base, "l-"));
    return { pub: new LocalDiskDriver(path.join(d, "media")), priv: new LocalDiskDriver(path.join(d, "private")) };
  }],
  ["S3-compatible", () => {
    const cfg = { endpoint: s3.endpoint, region: "us-east-1", bucket: `b${Math.random().toString(36).slice(2, 8)}`, accessKeyId: "k", secretAccessKey: "s", forcePathStyle: true, prefix: "" };
    return { pub: new S3Driver(cfg, "media"), priv: new S3Driver(cfg, "private") };
  }],
];

describe.each(drivers)("canary (%s)", (_name, mk) => {
  it("proves persistence across two simulated redeployments, then detects a wipe", async () => {
    const pair = mk();
    const store = memStore();
    const w = await writeCanary(dep(store, pair, "aaaa1111", "2026-11-12T10:00:00Z", "2026-11-12T10:01:00Z"));
    expect(w.publicPath).toMatch(/^\/media\/canary\/[0-9a-f]{16}\.png$/);
    expect(w.privateProbePath).toMatch(/-p\.png$/);

    // same deployment: ok, but it proves nothing about redeployments yet
    const c0 = await checkCanary(dep(store, pair, "aaaa1111", "2026-11-12T10:00:00Z", "2026-11-12T10:02:00Z"));
    expect(c0.ok).toBe(true);
    expect(c0.canaries[0]).toMatchObject({ survivedRedeploy: false, survivedRestart: false });
    expect(c0.twoRedeploysProven).toBe(false);

    // redeploy #1 (new release folder, new process)
    await writeCanary(dep(store, pair, "bbbb2222", "2026-11-12T11:00:00Z", "2026-11-12T11:01:00Z"));
    const c1 = await checkCanary(dep(store, pair, "bbbb2222", "2026-11-12T11:00:00Z", "2026-11-12T11:02:00Z"));
    expect(c1.ok).toBe(true);
    expect(c1.twoRedeploysProven).toBe(false);

    // redeploy #2
    const c2 = await checkCanary(dep(store, pair, "cccc3333", "2026-11-12T12:00:00Z", "2026-11-12T12:01:00Z"));
    expect(c2).toMatchObject({ ok: true, twoRedeploysProven: true, distinctDeploymentsSeen: 3 });
    expect(c2.canaries.every((r) => r.survivedRedeploy && r.survivedRestart)).toBe(true);

    // wipe the public scope -> detected
    await pair.pub.delete((await store.get()).map((e) => `canary/${e.id}.png`)[0]!);
    expect((await checkCanary(dep(store, pair, "cccc3333", "2026-11-12T12:00:00Z", "2026-11-12T12:05:00Z"))).ok).toBe(false);

    expect(await cleanupCanary(dep(store, pair, "cccc3333", "2026-11-12T12:00:00Z", "2026-11-12T12:06:00Z"))).toEqual({ removed: 2 });
    expect((await checkCanary(dep(store, pair, "cccc3333", "2026-11-12T12:00:00Z", "2026-11-12T12:07:00Z"))).ok).toBe(false); // nothing to prove
  });

  it("cycle: write/read/delete/recreate on both scopes and scope isolation", async () => {
    const pair = mk();
    const r = await cycleCanary(dep(memStore(), pair, "dddd4444", "2026-11-12T10:00:00Z", "2026-11-12T10:01:00Z"));
    expect(r.ok).toBe(true);
    expect(Object.keys(r.checks)).toEqual(expect.arrayContaining(["publicWrite", "privateDelete", "privateRecreate", "privateNotInPublicScope"]));
  });
});

describe("POST /api/maintenance/storage-canary", () => {
  const TOKEN = "Zk3Jd9sLm2PqRt7VxZb4NcF8gHw1YuAe6QwErTy";
  const call = (action: unknown, token = TOKEN) =>
    canaryPOST(new Request("https://btnv.fr/api/maintenance/storage-canary", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ action }) }));
  beforeEach(async () => {
    await resetDb();
    vi.unstubAllEnvs();
    resetStorageDrivers();
    const d = mkdtempSync(path.join(base, "r-"));
    vi.stubEnv("STORAGE_DRIVER", "local");
    vi.stubEnv("MEDIA_STORAGE_DIR", path.join(d, "media"));
    vi.stubEnv("PRIVATE_STORAGE_DIR", path.join(d, "private"));
  });

  it("is hidden without the token configuration and rejects wrong tokens / actions", async () => {
    expect((await call("write")).status).toBe(404);
    vi.stubEnv("MAINTENANCE_TOKEN", TOKEN);
    expect((await call("write", "wrong-token-wrong-token-wrong-token-xx")).status).toBe(401);
    expect((await call("explode")).status).toBe(400);
    expect((await canaryGET()).status).toBe(404);
  });

  it("write -> check -> cycle -> cleanup against the real database record; never leaks paths", async () => {
    vi.stubEnv("MAINTENANCE_TOKEN", TOKEN);
    const w = (await (await call("write")).json()) as { ok: boolean; publicPath: string; driver: string };
    expect(w).toMatchObject({ ok: true, driver: "local" });
    const check = (await (await call("check")).json()) as { ok: boolean; canaries: unknown[] };
    expect(check.ok).toBe(true);
    expect(check.canaries).toHaveLength(1);
    expect(((await (await call("cycle")).json()) as { ok: boolean }).ok).toBe(true);
    expect((await db.setting.findUniqueOrThrow({ where: { key: "system.canary" } })).value).toHaveLength(1);
    const text = JSON.stringify(check);
    expect(text).not.toContain(base);
    expect(((await (await call("cleanup")).json()) as { removed: number }).removed).toBe(1);
  });
});
