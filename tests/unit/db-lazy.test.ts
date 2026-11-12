import { describe, expect, it, vi } from "vitest";

describe("db client is lazy", () => {
  it("importing @/lib/db never throws, even without DATABASE_URL; the first query does", async () => {
    vi.resetModules();
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const mod = await import("@/lib/db"); // must not throw (this is what `next build` does)
      expect(mod.db).toBeDefined();
      delete (globalThis as { __batinovaDb?: unknown }).__batinovaDb;
      expect(() => mod.db.user).toThrow(/DATABASE_URL/);
    } finally {
      process.env.DATABASE_URL = saved;
      delete (globalThis as { __batinovaDb?: unknown }).__batinovaDb;
    }
  });
});
