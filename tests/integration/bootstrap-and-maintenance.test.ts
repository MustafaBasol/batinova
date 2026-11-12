import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { bootstrapOwner } from "@/lib/auth/bootstrap";
import { checkMaintenanceToken } from "@/lib/security/maintenance-token";
import { POST as purgePOST, GET as purgeGET } from "@/app/api/maintenance/purge/route";
import { POST as proxyPOST } from "@/app/api/maintenance/proxy-check/route";
import { resetServerEnvCache } from "@/lib/config/env";
import { db, resetDb } from "../support/db";

beforeEach(async () => {
  await resetDb();
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

const TOKEN = "Zk3Jd9sLm2PqRt7VxZb4NcF8gHw1YuAe6QwErTy";
const req = (token?: string) => new Request("https://btnv.fr/api/maintenance/purge", { method: "POST", headers: token ? { authorization: `Bearer ${token}`, "x-forwarded-for": "198.51.100.7" } : {} });

describe("bootstrapOwner", () => {
  it("is disabled without BOOTSTRAP_OWNER_* and creates nothing", async () => {
    expect((await bootstrapOwner(db, {})).result).toBe("disabled");
    expect(await db.user.count()).toBe(0);
  });

  it("creates the first OWNER from an Argon2id hash only, once (idempotent) and audits it", async () => {
    const env = { BOOTSTRAP_OWNER_EMAIL: "Owner@Example.test", BOOTSTRAP_OWNER_PASSWORD_HASH: await hashPassword("correct horse battery staple"), BOOTSTRAP_OWNER_NAME: "Propriétaire Test" };
    const first = await bootstrapOwner(db, env);
    expect(first.result).toBe("created");
    const u = await db.user.findUniqueOrThrow({ where: { email: "owner@example.test" } });
    expect(u.role).toBe("OWNER");
    expect(u.passwordHash).toBe(env.BOOTSTRAP_OWNER_PASSWORD_HASH);
    expect(await db.auditLog.count({ where: { action: "user.bootstrap_env" } })).toBe(1);
    const second = await bootstrapOwner(db, env);
    expect(second.result).toBe("owner_exists");
    expect(second.warning).toMatch(/remove/i);
    expect(await db.user.count()).toBe(1);
  });

  it("is permanently inert once any OWNER exists: it cannot add or change accounts", async () => {
    await db.user.create({ data: { email: "existing@example.test", name: "E", role: "OWNER", passwordHash: "x" } });
    const r = await bootstrapOwner(db, { BOOTSTRAP_OWNER_EMAIL: "attacker@example.test", BOOTSTRAP_OWNER_PASSWORD_HASH: await hashPassword("another long password!") });
    expect(r.result).toBe("owner_exists");
    expect(await db.user.count({ where: { email: "attacker@example.test" } })).toBe(0);
  });

  it("rejects clear-text passwords, bad e-mails and non-OWNER e-mail clashes", async () => {
    expect((await bootstrapOwner(db, { BOOTSTRAP_OWNER_EMAIL: "o@example.test", BOOTSTRAP_OWNER_PASSWORD_HASH: "plainpassword123" })).result).toBe("invalid");
    expect((await bootstrapOwner(db, { BOOTSTRAP_OWNER_EMAIL: "not-an-email", BOOTSTRAP_OWNER_PASSWORD_HASH: await hashPassword("long enough password") })).result).toBe("invalid");
    await db.user.create({ data: { email: "ed@example.test", name: "Ed", role: "EDITOR", passwordHash: "x" } });
    expect((await bootstrapOwner(db, { BOOTSTRAP_OWNER_EMAIL: "ed@example.test", BOOTSTRAP_OWNER_PASSWORD_HASH: await hashPassword("long enough password") })).result).toBe("invalid");
    expect((await db.user.findUniqueOrThrow({ where: { email: "ed@example.test" } })).role).toBe("EDITOR");
  });
});

describe("maintenance token", () => {
  it("is disabled (404) without a strong MAINTENANCE_TOKEN", async () => {
    expect(checkMaintenanceToken("Bearer x", undefined)).toBe("disabled");
    expect(checkMaintenanceToken("Bearer short", "short")).toBe("disabled");
    expect((await purgePOST(req("anything"))).status).toBe(404);
  });

  it("accepts only the exact bearer token (constant-time compare)", () => {
    expect(checkMaintenanceToken(`Bearer ${TOKEN}`, TOKEN)).toBe("ok");
    expect(checkMaintenanceToken(`Bearer ${TOKEN}x`, TOKEN)).toBe("denied");
    expect(checkMaintenanceToken(TOKEN, TOKEN)).toBe("denied");
    expect(checkMaintenanceToken(null, TOKEN)).toBe("denied");
  });
});

describe("POST /api/maintenance/purge", () => {
  it("rejects wrong tokens (401), throttles them (429), never accepts GET, and a valid token still works", async () => {
    vi.stubEnv("MAINTENANCE_TOKEN", TOKEN);
    expect((await purgeGET()).status).toBe(404);
    expect((await purgePOST(req())).status).toBe(401);
    for (let i = 0; i < 9; i++) expect((await purgePOST(req("w".repeat(40)))).status).toBe(401);
    expect((await purgePOST(req("w".repeat(40)))).status).toBe(429);
    const ok = await purgePOST(req(TOKEN));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, leads: 0 });
  });

  it("purges expired leads and returns counts only", async () => {
    vi.stubEnv("MAINTENANCE_TOKEN", TOKEN);
    await db.lead.create({ data: { name: "Old", email: "old@example.test", postalCode: "93600", projectType: "x", message: "m", consentAt: new Date(0), consentTextVersion: "v1", retentionUntil: new Date(Date.now() - 86_400_000) } });
    const res = await purgePOST(req(TOKEN));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.leads).toBe(1);
    expect(JSON.stringify(body)).not.toMatch(/example\.test/);
    expect(await db.lead.count()).toBe(0);
  });
});

describe("POST /api/maintenance/proxy-check", () => {
  it("reports the derived client IP for the caller only with a valid token", async () => {
    vi.stubEnv("MAINTENANCE_TOKEN", TOKEN);
    vi.stubEnv("TRUST_PROXY", "true");
    vi.stubEnv("TRUST_PROXY_HOPS", "2");
    resetServerEnvCache();
    const call = (t: string) => proxyPOST(new Request("https://btnv.fr/x", { method: "POST", headers: { authorization: `Bearer ${t}`, "x-forwarded-for": "203.0.113.9, 10.0.0.1, 172.16.0.1" } }));
    expect((await call("bad")).status).toBe(401);
    const body = (await (await call(TOKEN)).json()) as Record<string, unknown>;
    expect(body).toMatchObject({ trustProxy: "true", hops: 2, xffEntries: 3, derivedIp: "10.0.0.1" });
  });
});
