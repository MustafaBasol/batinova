import { describe, expect, it } from "vitest";
import { isPubliclyVisible, publishedWhere } from "@/lib/content/publish";
import { isValidPagePath, slugify, toPagePath } from "@/lib/content/paths";
import { SETTING_KEYS, analyticsAllowed, defaultSettings, isVerified } from "@/lib/settings-schema";

const now = new Date("2026-11-12T10:00:00Z");
const past = new Date("2026-11-01T10:00:00Z");
const future = new Date("2026-12-01T10:00:00Z");

describe("isPubliclyVisible (mirror of publishedWhere)", () => {
  it.each([
    [{ status: "DRAFT", publishedAt: past, scheduledAt: null }, false],
    [{ status: "ARCHIVED", publishedAt: past, scheduledAt: null }, false],
    [{ status: "PUBLISHED", publishedAt: past, scheduledAt: null }, true],
    [{ status: "PUBLISHED", publishedAt: null, scheduledAt: null }, true],
    [{ status: "PUBLISHED", publishedAt: future, scheduledAt: null }, false],
    [{ status: "SCHEDULED", publishedAt: null, scheduledAt: future }, false],
    [{ status: "SCHEDULED", publishedAt: null, scheduledAt: past }, true],
    [{ status: "PUBLISHED", publishedAt: past, scheduledAt: null, deletedAt: past }, false],
  ] as const)("%o -> %s", (row, expected) => {
    expect(isPubliclyVisible(row, now)).toBe(expected);
  });

  it("publishedWhere always requires deletedAt null", () => {
    expect(publishedWhere(now).deletedAt).toBeNull();
  });
});

describe("page paths", () => {
  it("home is the empty path and reserved segments are rejected", () => {
    expect(isValidPagePath("")).toBe(true);
    expect(isValidPagePath("services/renovation")).toBe(true);
    expect(isValidPagePath("zones-intervention/manche")).toBe(true);
    expect(isValidPagePath("admin")).toBe(false);
    expect(isValidPagePath("media/x")).toBe(false);
    expect(isValidPagePath("Services")).toBe(false);
    expect(isValidPagePath("../etc")).toBe(false);
    expect(toPagePath(["Services", "renovation"])).toBe("services/renovation");
    expect(toPagePath(undefined)).toBe("");
  });

  it("slugify folds French accents", () => {
    expect(slugify("Île-de-France : rénovation d’une maison")).toBe("ile-de-france-renovation-d-une-maison");
    expect(slugify("Cœur de métier")).toBe("coeur-de-metier");
  });
});

describe("settings defaults (no invention)", () => {
  const s = defaultSettings();

  it("all company identity fields are empty and unverified", () => {
    for (const [key, field] of Object.entries(s.company)) {
      expect(field.verified, key).toBe(false);
      expect(isVerified(field), key).toBe(false);
      if (key !== "tradeName") expect(field.value, key).toBe("");
    }
  });

  it("all mailboxes are unprovisioned; mail and analytics disabled", () => {
    for (const k of ["contact", "devis", "projets", "direction", "privacy"] as const) {
      expect(s.emailRouting[k].provisioned).toBe(false);
      expect(s.emailRouting[k].address).toBe(`${k}@btnv.fr`);
    }
    expect(s.mail.enabled).toBe(false);
    expect(s.analytics).toEqual({ provider: "none", id: "", enabled: false, requiresConsent: true });
    expect(analyticsAllowed(s.analytics, true)).toBe(false);
    expect(analyticsAllowed({ provider: "ga4", id: "G-X", enabled: true, requiresConsent: false }, false)).toBe(false);
    expect(s.seo.googleSiteVerification).toBe("");
  });

  it("address is the user-supplied Aulnay-sous-Bois base; lead retention unconfirmed", () => {
    expect(s.address).toMatchObject({ postalCode: "93600", addressLocality: "Aulnay-sous-Bois", source: "user-supplied" });
    expect(s.leads.retentionDays).toBe(1095);
    expect(s.leads.retentionConfirmed).toBe(false);
    expect(s.serviceAreas.areas.find((a) => a.code === "MANCHE")?.highlighted).toBe(true);
    expect(SETTING_KEYS).toContain("social");
    expect(Object.values(s.social).every((v) => v === "")).toBe(true);
  });
});
