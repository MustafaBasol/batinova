import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDb, db } from "../support/db";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "vitest", "x-forwarded-for": "198.51.100.7" }),
}));

import { submitQuote } from "@/app/(site)/devis/actions";

const base: Record<string, string> = {
  name: "Camille Essai",
  email: "camille@example.test",
  postalCode: "93600",
  city: "Aulnay-sous-Bois",
  region: "",
  projectType: "extension",
  message: "Extension d’une maison de 90 m² avec nouvelle pièce de vie.",
  budgetRange: "50k_100k",
  desiredTimeline: "6_months",
  desiredStartDate: "",
  phone: "",
  consent: "on",
  website: "",
};

function form(over: Record<string, string> = {}, startedMsAgo = 10_000) {
  const fd = new FormData();
  const data = { ...base, formStartedAt: String(Date.now() - startedMsAgo), ...over };
  for (const [k, v] of Object.entries(data)) fd.set(k, v);
  return fd;
}

beforeEach(resetDb);

describe("quote form server action", () => {
  it("saves a valid quote and returns a success state without echoing personal data", async () => {
    const res = await submitQuote({ status: "idle" }, form());
    expect(res).toEqual({ status: "success" });
    const lead = await db.lead.findFirstOrThrow();
    expect(lead.projectType).toBe("extension");
    expect(lead.region).toBe("ILE_DE_FRANCE");
  });

  it("returns field errors when consent is missing or fields are invalid", async () => {
    const res = await submitQuote({ status: "idle" }, form({ consent: "", email: "nope", postalCode: "12" }));
    expect(res.status).toBe("error");
    expect(res.fieldErrors).toMatchObject({ email: expect.any(String), postalCode: expect.any(String), consent: expect.any(String) });
    expect(await db.lead.count()).toBe(0);
  });

  it("silently discards honeypot and too-fast submissions (success shown, nothing stored)", async () => {
    expect((await submitQuote({ status: "idle" }, form({ website: "http://spam.test" }))).status).toBe("success");
    expect((await submitQuote({ status: "idle" }, form({}, 200))).status).toBe("success");
    expect(await db.lead.count()).toBe(0);
  });
});
