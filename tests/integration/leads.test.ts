import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDb, db } from "../support/db";
import { submitLead, deliverLeadNotification, LEAD_IP_LIMIT } from "@/lib/leads/service";
import { purgeExpiredLeads } from "@/lib/leads/retention";
import { MemoryMailer, setMailerForTests, sanitizeMailError, smtpConfigFromEnv, getMailer } from "@/lib/mail";
import { updateSetting } from "@/lib/settings";
import { getPrivateStorage } from "@/lib/storage";
import { audit, sanitizeSummary } from "@/lib/security/audit";
import { isSameOrigin } from "@/lib/security/origin";

const valid = {
  name: "Jeanne Test",
  email: "Jeanne@Example.test",
  phone: "",
  postalCode: "50100",
  city: "Cherbourg-en-Cotentin",
  projectType: "renovation",
  message: "Rénovation complète d’une maison.",
  budgetRange: "50k_100k",
  consent: "on",
  website: "",
};
const ctx = (ip = "203.0.113.5") => ({ ip, userAgent: "vitest" });

beforeEach(resetDb);
afterEach(() => setMailerForTests(null));

describe("lead intake", () => {
  it("saves a valid lead with hashed IP, consent version and retention; mail NOT_CONFIGURED by default", async () => {
    const res = await submitLead(valid, ctx());
    expect(res.ok).toBe(true);
    const lead = await db.lead.findFirstOrThrow();
    expect(lead.email).toBe("jeanne@example.test");
    expect(lead.region).toBe("MANCHE");
    expect(lead.ipHash).toMatch(/^[0-9a-f]{32}$/);
    expect(lead.ipHash).not.toContain("203.0.113.5");
    expect(lead.consentTextVersion).toBe("2026-11-v1");
    expect(lead.retentionUntil.getTime()).toBeGreaterThan(Date.now() + 1000 * 24 * 3600_000);
    expect(lead.mailDeliveryState).toBe("NOT_CONFIGURED");
    expect(lead.mailAttempts).toBe(0);
  });

  it("requires consent and validates fields", async () => {
    const res = await submitLead({ ...valid, consent: undefined, postalCode: "123" }, ctx());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.fieldErrors ?? {})).toEqual(expect.arrayContaining(["consent", "postalCode"]));
    expect(await db.lead.count()).toBe(0);
  });

  it("silently discards honeypot and too-fast submissions", async () => {
    expect(await submitLead({ ...valid, website: "http://spam" }, ctx())).toEqual({ ok: true, leadId: null });
    expect(await submitLead({ ...valid, formStartedAt: String(Date.now()) }, ctx())).toEqual({ ok: true, leadId: null });
    expect(await db.lead.count()).toBe(0);
  });

  it("rate-limits per IP", async () => {
    for (let i = 0; i < LEAD_IP_LIMIT; i++) {
      await submitLead({ ...valid, email: `p${i}@example.test` }, ctx("198.51.100.7"));
    }
    const res = await submitLead({ ...valid, email: "last@example.test" }, ctx("198.51.100.7"));
    expect(res.ok).toBe(false);
    expect(await db.lead.count()).toBe(LEAD_IP_LIMIT);
  });

  it("never loses the lead when mail fails, records the error and allows resend", async () => {
    setMailerForTests(new MemoryMailer(true));
    const res = await submitLead(valid, ctx());
    expect(res.ok).toBe(true);
    const lead = await db.lead.findFirstOrThrow();
    expect(lead.mailDeliveryState).toBe("FAILED");
    expect(lead.mailAttempts).toBe(1);
    expect(lead.lastMailError).toBe("simulated failure");

    const ok = new MemoryMailer();
    setMailerForTests(ok);
    expect(await deliverLeadNotification(lead.id, "admin-id")).toBe("SENT");
    const after = await db.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(after).toMatchObject({ mailDeliveryState: "SENT", mailAttempts: 2, lastMailError: null });
    expect(ok.sent[0]?.to).toEqual(["devis@btnv.fr"]);
    expect(ok.sent[0]?.replyTo).toBe("jeanne@example.test");
  });

  it("stores attachments only in private storage when enabled, rejecting bad types", async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const off = await submitLead(valid, ctx(), [{ name: "plan.png", bytes: png }]);
    expect(off.ok).toBe(false);

    await updateSetting("leads", { attachmentsEnabled: true }, null);
    const bad = await submitLead(valid, ctx(), [{ name: "x.svg", bytes: new TextEncoder().encode("<svg onload=alert(1)>") }]);
    expect(bad.ok).toBe(false);

    const res = await submitLead(valid, ctx(), [{ name: "../../plan maison.png", bytes: png }]);
    expect(res.ok).toBe(true);
    const att = await db.leadAttachment.findFirstOrThrow();
    expect(att.storageKey.startsWith("leads/")).toBe(true);
    expect(att.originalName).toBe("plan maison.png");
    expect(att.kind).toBe("IMAGE");
    expect(await getPrivateStorage().exists(att.storageKey)).toBe(true);
  });

  it("purges expired leads and their private files", async () => {
    await updateSetting("leads", { attachmentsEnabled: true }, null);
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
    await submitLead(valid, ctx(), [{ name: "a.png", bytes: png }]);
    const att = await db.leadAttachment.findFirstOrThrow();
    expect(await purgeExpiredLeads(new Date())).toBe(0);
    expect(await purgeExpiredLeads(new Date(Date.now() + 1200 * 24 * 3600_000))).toBe(1);
    expect(await db.lead.count()).toBe(0);
    expect(await getPrivateStorage().exists(att.storageKey)).toBe(false);
  });
});

describe("mail configuration", () => {
  it("requires every SMTP variable and is disabled in tests", async () => {
    expect(smtpConfigFromEnv({ SMTP_HOST: "smtp.hostinger.com", SMTP_PORT: "465" })).toBeNull();
    expect(
      smtpConfigFromEnv({ SMTP_HOST: "smtp.hostinger.com", SMTP_PORT: "465", SMTP_USER: "u", SMTP_PASSWORD: "p", MAIL_FROM: "x <a@b.fr>" }),
    ).toMatchObject({ secure: true, port: 465 });
    expect((await getMailer()).name).toBe("disabled");
  });

  it("sanitizes mail errors", () => {
    const msg = sanitizeMailError(new Error("Invalid login: 535 user=contact@btnv.fr password=hunter2\r\nmore"));
    expect(msg).not.toContain("hunter2");
    expect(msg).not.toContain("contact@btnv.fr");
    expect(msg).not.toMatch(/[\r\n]/);
  });
});

describe("audit & origin helpers", () => {
  it("audit strips PII-looking keys", async () => {
    expect(sanitizeSummary({ email: "a@b", password: "x", path: "a-propos", status: "PUBLISHED", n: 1 })).toEqual({
      path: "a-propos",
      status: "PUBLISHED",
      n: 1,
    });
    await audit(null, "page.publish", { type: "Page", id: "p1" }, { phone: "0600", slug: "x" });
    const row = await db.auditLog.findFirstOrThrow({ where: { action: "page.publish" } });
    expect(row.summary).toEqual({ slug: "x" });
  });

  it("assertSameOrigin logic", () => {
    const req = (h: Record<string, string>) => new Request("https://btnv.fr/api/x", { method: "POST", headers: h });
    expect(isSameOrigin(req({ origin: "https://btnv.fr", host: "btnv.fr" }))).toBe(true);
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "btnv.fr" }))).toBe(false);
    expect(isSameOrigin(req({ referer: "https://btnv.fr/admin", host: "btnv.fr" }))).toBe(true);
    expect(isSameOrigin(req({ host: "btnv.fr" }))).toBe(false);
  });
});
