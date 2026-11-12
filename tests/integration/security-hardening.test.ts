import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "../support/db";
import { rateLimit } from "@/lib/security/rate-limit";
import { getClientIp } from "@/lib/security/ip";
import { resetServerEnvCache } from "@/lib/config/env";
import { assertProductionEnv, productionEnvProblems } from "@/lib/config/production";
import { safeNext } from "@/lib/auth/redirect";
import { serializeJsonLd } from "@/lib/seo/jsonld";
import { isSafeHref } from "@/lib/security/href";
import { submitLead } from "@/lib/leads/service";
import { purgeExpiredLeads } from "@/lib/leads/retention";
import { runRetentionPurge } from "@/lib/maintenance";
import { setMailerForTests, type Mailer } from "@/lib/mail";
import { getPrivateStorage } from "@/lib/storage";
import { LocalDiskDriver } from "@/lib/storage/local-disk";
import { sniffMime } from "@/lib/storage/mime";

beforeEach(async () => {
  await resetDb();
});
afterEach(() => {
  setMailerForTests(null);
  vi.unstubAllEnvs();
  resetServerEnvCache();
  vi.restoreAllMocks();
});

describe("rate limiter under concurrency", () => {
  it("never grants more than `limit` attempts to concurrent requests on a fresh key", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => rateLimit("race:fresh", 5, 60_000)));
    expect(results.filter((r) => r.allowed).length).toBe(5);
  });

  it("never over-grants when the window expired and requests race to reset it", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    await rateLimit("race:expired", 5, 60_000, t0);
    const later = new Date(t0.getTime() + 61_000);
    const results = await Promise.all(Array.from({ length: 25 }, () => rateLimit("race:expired", 5, 60_000, later)));
    expect(results.filter((r) => r.allowed).length).toBe(5);
    const row = await db.rateLimitBucket.findUnique({ where: { key: "race:expired" } });
    expect(row?.count).toBe(25);
  });

  it("starts a new window after expiry and denies with retryAfter inside it", async () => {
    const t0 = new Date("2026-01-01T00:00:00Z");
    for (let i = 0; i < 3; i++) await rateLimit("win", 2, 1000, t0);
    const denied = await rateLimit("win", 2, 1000, new Date(t0.getTime() + 500));
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBe(500);
    const fresh = await rateLimit("win", 2, 1000, new Date(t0.getTime() + 1000));
    expect(fresh.allowed).toBe(true);
    expect(fresh.count).toBe(1);
  });
});

describe("client IP / TRUST_PROXY", () => {
  const h = (xff?: string, real?: string) => {
    const x = new Headers();
    if (xff) x.set("x-forwarded-for", xff);
    if (real) x.set("x-real-ip", real);
    return x;
  };

  it("ignores forwarding headers by default (TRUST_PROXY=false)", () => {
    vi.stubEnv("TRUST_PROXY", "false");
    resetServerEnvCache();
    expect(getClientIp(h("1.2.3.4", "5.6.7.8"))).toBe("unknown");
  });

  it("behind a proxy uses the entry appended by the proxy, not the client-supplied leftmost one", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    resetServerEnvCache();
    expect(getClientIp(h("6.6.6.6, 203.0.113.9"))).toBe("203.0.113.9");
    expect(getClientIp(h("203.0.113.9"))).toBe("203.0.113.9");
    expect(getClientIp(h(undefined, "198.51.100.2"))).toBe("198.51.100.2");
    expect(getClientIp(h("2001:db8::1"))).toBe("2001:db8::1");
    expect(getClientIp(h("203.0.113.9:4711"))).toBe("203.0.113.9");
  });

  it("rejects non-IP garbage (header injection into rate-limit identities)", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    resetServerEnvCache();
    expect(getClientIp(h("<script>alert(1)</script>"))).toBe("unknown");
    expect(getClientIp(h("999.1.1.1"))).toBe("unknown");
    expect(getClientIp(h())).toBe("unknown");
  });
});

describe("client IP with TRUST_PROXY_HOPS / CLIENT_IP_HEADER", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("takes the Nth entry from the right (default 1 hop) and ignores forged left entries", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    resetServerEnvCache();
    expect(getClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.5" }))).toBe("203.0.113.5");
    vi.stubEnv("TRUST_PROXY_HOPS", "2");
    expect(getClientIp(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.5, 10.1.1.1" }))).toBe("203.0.113.5");
    // fewer entries than trusted hops => the request skipped a proxy: do not trust it
    expect(getClientIp(h({ "x-forwarded-for": "6.6.6.6" }))).toBe("unknown");
  });
  it("uses an allow-listed CLIENT_IP_HEADER only, and never when TRUST_PROXY is false", () => {
    vi.stubEnv("TRUST_PROXY", "true");
    vi.stubEnv("CLIENT_IP_HEADER", "cf-connecting-ip");
    resetServerEnvCache();
    expect(getClientIp(h({ "cf-connecting-ip": "198.51.100.4", "x-forwarded-for": "6.6.6.6" }))).toBe("198.51.100.4");
    expect(getClientIp(h({ "x-forwarded-for": "6.6.6.6" }))).toBe("unknown");
    vi.stubEnv("CLIENT_IP_HEADER", "x-evil");
    expect(getClientIp(h({ "x-evil": "1.2.3.4", "x-forwarded-for": "198.51.100.9" }))).toBe("198.51.100.9");
    vi.stubEnv("TRUST_PROXY", "false");
    resetServerEnvCache();
    expect(getClientIp(h({ "cf-connecting-ip": "198.51.100.4" }))).toBe("unknown");
  });
});

describe("production environment validation", () => {
  const good = {
    NODE_ENV: "production",
    SESSION_SECRET: "k3Jd9sLm2PqRt7VxZb4NcF8gHw1YuAe6",
    IP_HASH_SECRET: "Qw8ErTy3UiOp5AsDf7GhJk9LzXc2VbNm",
    SITE_URL: "https://btnv.fr",
    DATABASE_URL: "mysql://u123_batinova:s3cr%40t-pw@127.0.0.1:3306/u123_batinova",
    MEDIA_STORAGE_DIR: "/data/media",
    PRIVATE_STORAGE_DIR: "/data/private",
    TRUST_PROXY: "false",
  };

  it("accepts a sound configuration", () => {
    expect(productionEnvProblems(good)).toEqual([]);
    expect(() => assertProductionEnv(good)).not.toThrow();
  });

  it("is a no-op outside production", () => {
    expect(() => assertProductionEnv({ NODE_ENV: "development" })).not.toThrow();
  });

  it("fails fast on missing/weak/placeholder/duplicate secrets without echoing values", () => {
    const p = productionEnvProblems({ ...good, SESSION_SECRET: "replace-with-generated-secret-0000000000", IP_HASH_SECRET: "a".repeat(40) });
    expect(p.join(" ")).toMatch(/SESSION_SECRET.*placeholder/);
    expect(p.join(" ")).toMatch(/IP_HASH_SECRET.*entropy/);
    expect(p.join(" ")).not.toContain("aaaaaaaa");
    expect(productionEnvProblems({ ...good, SESSION_SECRET: undefined }).join()).toMatch(/SESSION_SECRET/);
    expect(productionEnvProblems({ ...good, IP_HASH_SECRET: good.SESSION_SECRET }).join()).toMatch(/must differ/);
  });

  it("requires an https bare SITE_URL (no silent fallback)", () => {
    expect(productionEnvProblems({ ...good, SITE_URL: undefined }).join()).toMatch(/SITE_URL/);
    expect(productionEnvProblems({ ...good, SITE_URL: "http://btnv.fr" }).join()).toMatch(/https/);
    expect(productionEnvProblems({ ...good, SITE_URL: "https://btnv.fr/blog" }).join()).toMatch(/bare origin/);
  });

  it("requires absolute persistent storage paths unless the local escape hatch is set", () => {
    const rel = { ...good, MEDIA_STORAGE_DIR: "./storage/media", PRIVATE_STORAGE_DIR: undefined };
    const p = productionEnvProblems(rel).join(" ");
    expect(p).toMatch(/MEDIA_STORAGE_DIR/);
    expect(p).toMatch(/PRIVATE_STORAGE_DIR/);
    expect(productionEnvProblems({ ...rel, ALLOW_EPHEMERAL_PATHS: "true" })).toEqual([]);
  });

  it("refuses storage inside the Hostinger-managed deployment folders and identical roots", () => {
    expect(productionEnvProblems({ ...good, MEDIA_STORAGE_DIR: "/home/u1/domains/btnv.fr/hbuilds/current/media" }).join()).toMatch(/hbuilds/);
    expect(productionEnvProblems({ ...good, PRIVATE_STORAGE_DIR: "/home/u1/domains/btnv.fr/public_html/private" }).join()).toMatch(/public_html/);
    expect(productionEnvProblems({ ...good, PRIVATE_STORAGE_DIR: good.MEDIA_STORAGE_DIR }).join()).toMatch(/must differ/);
  });

  it("validates DATABASE_URL: mysql:// on 127.0.0.1 with a password, never SQLite or localhost", () => {
    expect(productionEnvProblems({ ...good, DATABASE_URL: "file:/data/db/batinova.db" }).join()).toMatch(/DATABASE_URL.*mysql/);
    expect(productionEnvProblems({ ...good, DATABASE_URL: undefined }).join()).toMatch(/DATABASE_URL/);
    expect(productionEnvProblems({ ...good, DATABASE_URL: "mysql://u:p@localhost:3306/db" }).join()).toMatch(/127\.0\.0\.1/);
    expect(productionEnvProblems({ ...good, DATABASE_URL: "mysql://u:p@db.example.net:3306/db" }).join()).toMatch(/127\.0\.0\.1/);
    expect(productionEnvProblems({ ...good, DATABASE_URL: "mysql://u@127.0.0.1:3306/db" }).join()).toMatch(/password/);
    const msg = productionEnvProblems({ ...good, DATABASE_URL: "mysql://u:topsecret@localhost/db" }).join();
    expect(msg).not.toContain("topsecret");
  });

  it("validates MAINTENANCE_TOKEN, proxy settings and indexing origin", () => {
    expect(productionEnvProblems({ ...good, MAINTENANCE_TOKEN: "short" }).join()).toMatch(/MAINTENANCE_TOKEN/);
    expect(productionEnvProblems({ ...good, MAINTENANCE_TOKEN: good.SESSION_SECRET }).join()).toMatch(/must differ/);
    expect(productionEnvProblems({ ...good, MAINTENANCE_TOKEN: "Zk3Jd9sLm2PqRt7VxZb4NcF8gHw1YuAe6QwErTy" })).toEqual([]);
    expect(productionEnvProblems({ ...good, TRUST_PROXY_HOPS: "9" }).join()).toMatch(/TRUST_PROXY_HOPS/);
    expect(productionEnvProblems({ ...good, CLIENT_IP_HEADER: "x-evil" }).join()).toMatch(/CLIENT_IP_HEADER/);
    expect(productionEnvProblems({ ...good, SITE_URL: "https://preview.example.net", SITE_INDEXING: "true" }).join()).toMatch(/SITE_INDEXING/);
    expect(productionEnvProblems({ ...good, STORAGE_DRIVER: "ftp" }).join()).toMatch(/STORAGE_DRIVER/);
    const s3 = productionEnvProblems({ ...good, STORAGE_DRIVER: "s3", MEDIA_STORAGE_DIR: undefined, PRIVATE_STORAGE_DIR: undefined }).join();
    expect(s3).toMatch(/S3_BUCKET/);
    expect(s3).not.toMatch(/MEDIA_STORAGE_DIR/);
  });

  it("rejects an invalid TRUST_PROXY value", () => {
    expect(productionEnvProblems({ ...good, TRUST_PROXY: "yes" }).join()).toMatch(/TRUST_PROXY/);
  });
});

describe("open redirect / href / JSON-LD", () => {
  it("login `next` only admits same-site /admin paths", () => {
    expect(safeNext("/admin/pages?x=1")).toBe("/admin/pages?x=1");
    for (const bad of ["https://evil.test", "//evil.test", "/\\evil.test", "/admin/..//evil", "/admin//evil.test", "javascript:alert(1)", "/admin/login", "/other", "/admin%2f%2fevil", ""]) {
      expect(safeNext(bad)).toBe("/admin");
    }
    expect(safeNext(undefined)).toBe("/admin");
  });

  it("rejects dangerous hrefs", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:1", "data:text/html,x", "//evil.test", "/\\evil.test", "http://x.test", "https://u:p@x.test", "vbscript:x", "java\nscript:x"]) {
      expect(isSafeHref(bad)).toBe(false);
    }
    expect(isSafeHref("/contact")).toBe(true);
    expect(isSafeHref("https://example.org/a")).toBe(true);
  });

  it("JSON-LD cannot break out of its <script> element", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>", d: "a&b " });
    expect(out).not.toContain("</script");
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("upload safety", () => {
  it("does not treat SVG/HTML/script content as an accepted image or PDF", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffMime(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'))).toBeNull();
    expect(sniffMime(enc("<html><script>1</script></html>"))).toBeNull();
    expect(sniffMime(enc("GIF89a"))).toBeNull();
  });

  it("storage drivers refuse path traversal keys", async () => {
    const d = new LocalDiskDriver("./.tmp/test-storage/traversal");
    for (const key of ["../x.png", "a/../../x.png", "/etc/passwd", "a\\..\\x.png", "..", "a/./b.png", ".hidden.png", "A.PNG"]) {
      await expect(d.put(key, Buffer.from("x"))).rejects.toThrow();
      expect(() => d.resolveKey(key)).toThrow();
    }
  });

  it("lead attachments: spoofed extension/Content-Type is ignored (SVG renamed .png is rejected, nothing stored)", async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    const res = await submitLead(validLead(), { ip: "203.0.113.20" }, [{ name: "../../evil.png", bytes: svg }]);
    expect(res.ok).toBe(false);
    expect(await db.lead.count()).toBe(0);
  });
});

function validLead(over: Record<string, unknown> = {}) {
  return {
    name: "Jeanne Test",
    email: "jeanne@example.test",
    phone: "",
    postalCode: "50100",
    city: "Cherbourg",
    projectType: "renovation",
    message: "Rénovation complète d’une maison.",
    consent: "on",
    website: "",
    ...over,
  };
}

describe("lead is kept when mail layer misbehaves", () => {
  it("keeps the lead and reports success when the mailer THROWS", async () => {
    const throwing: Mailer = {
      name: "memory",
      enabled: true,
      send: async () => {
        throw new Error("ECONNREFUSED smtp.example.test:465 user=secret pass=hunter2");
      },
    } as unknown as Mailer;
    setMailerForTests(throwing);
    const res = await submitLead(validLead({ email: "m1@example.test" }), { ip: "203.0.113.21" });
    expect(res.ok).toBe(true);
    const lead = await db.lead.findFirstOrThrow();
    expect(lead.mailDeliveryState).toBe("FAILED");
    expect(lead.lastMailError ?? "").not.toContain("hunter2");
  });

  it("keeps the lead and reports success when the mail layer fails entirely (e.g. settings read error)", async () => {
    const mod = await import("@/lib/mail");
    const spy = vi.spyOn(mod, "getMailer").mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await submitLead(validLead({ email: "m2@example.test" }), { ip: "203.0.113.22" });
    expect(spy).toHaveBeenCalled();
    expect(res.ok).toBe(true);
    expect(await db.lead.count()).toBe(1);
  });

  it("works with no SMTP credentials at all (NOT_CONFIGURED)", async () => {
    const res = await submitLead(validLead({ email: "m3@example.test" }), { ip: "203.0.113.23" });
    expect(res.ok).toBe(true);
    expect((await db.lead.findFirstOrThrow()).mailDeliveryState).toBe("NOT_CONFIGURED");
  });
});

describe("GDPR retention purge", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4\n%test\n");

  async function leadWithFile(email: string, retentionUntil: Date, extra: Record<string, unknown> = {}) {
    const key = `leads/2026/01/${Math.random().toString(16).slice(2).padEnd(24, "0")}.pdf`;
    await getPrivateStorage().put(key, pdf, "application/pdf");
    const lead = await db.lead.create({
      data: {
        name: "A", email, postalCode: "75001", projectType: "renovation", message: "m", consentAt: new Date(), consentTextVersion: "v",
        ipHash: "x", retentionUntil, ...extra,
        attachments: { create: { storageKey: key, originalName: "a.pdf", mime: "application/pdf", sizeBytes: pdf.length, kind: "DOCUMENT" } },
      },
    });
    return { lead, key };
  }

  it("deletes expired leads and their private files, keeps the rest", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const old = await leadWithFile("old@example.test", new Date("2026-05-01T00:00:00Z"));
    const fresh = await leadWithFile("fresh@example.test", new Date("2027-05-01T00:00:00Z"));
    const n = await purgeExpiredLeads(now);
    expect(n).toBe(1);
    expect(await db.lead.findUnique({ where: { id: old.lead.id } })).toBeNull();
    expect(await db.leadAttachment.count({ where: { leadId: old.lead.id } })).toBe(0);
    expect(await getPrivateStorage().exists(old.key)).toBe(false);
    expect(await getPrivateStorage().exists(fresh.key)).toBe(true);
  });

  it("keeps the row (so the file is not orphaned) when file deletion fails, and retries next run", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    const old = await leadWithFile("old2@example.test", new Date("2026-05-01T00:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const del = vi.spyOn(LocalDiskDriver.prototype, "delete").mockRejectedValueOnce(Object.assign(new Error("EBUSY"), { code: "EBUSY" }));
    expect(await purgeExpiredLeads(now)).toBe(0);
    expect(await db.lead.findUnique({ where: { id: old.lead.id } })).not.toBeNull();
    del.mockRestore();
    expect(await purgeExpiredLeads(now)).toBe(1);
    expect(await getPrivateStorage().exists(old.key)).toBe(false);
  });

  it("purges spam and long soft-deleted leads and reports a summary incl. sessions/buckets", async () => {
    const now = new Date("2026-06-01T00:00:00Z");
    await leadWithFile("del@example.test", new Date("2030-01-01T00:00:00Z"), { deletedAt: new Date("2026-04-01T00:00:00Z") });
    await db.rateLimitBucket.create({ data: { key: "old", count: 1, windowStart: new Date("2026-01-01T00:00:00Z") } });
    const s = await runRetentionPurge({ now });
    expect(s.leads).toBe(1);
    expect(s.rateLimitBuckets).toBe(1);
  });
});
