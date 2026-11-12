// Start-up persistence guard against the REAL database record (Setting `system.storage`), simulating redeployments.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { assertStoragePersistence } from "@/lib/storage/startup-check";
import { StoragePersistenceError } from "@/lib/storage/persistence";
import { db, resetDb } from "../support/db";

const base = mkdtempSync(path.join(tmpdir(), "btnv-startup-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));
let n = 0;
beforeEach(async () => {
  await resetDb();
  vi.unstubAllEnvs();
  n += 1;
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("MEDIA_STORAGE_DIR", path.join(base, `r${n}`, "media"));
  vi.stubEnv("PRIVATE_STORAGE_DIR", path.join(base, `r${n}`, "private"));
});

describe("assertStoragePersistence (production start-up)", () => {
  it("first start records ids; later starts (redeployments) verify", async () => {
    await assertStoragePersistence();
    const row = await db.setting.findUniqueOrThrow({ where: { key: "system.storage" } });
    expect(row.value).toMatchObject({ mediaId: expect.any(String), privateId: expect.any(String) });
    await expect(assertStoragePersistence()).resolves.toBeUndefined();
    await expect(assertStoragePersistence()).resolves.toBeUndefined();
  });

  it("refuses to start after the storage directories vanished (e.g. a deployment wiped them)", async () => {
    await assertStoragePersistence();
    rmSync(path.join(base, `r${n}`), { recursive: true, force: true });
    await expect(assertStoragePersistence()).rejects.toThrow(StoragePersistenceError);
  });

  it("does nothing for the S3 driver", async () => {
    vi.stubEnv("STORAGE_DRIVER", "s3");
    await expect(assertStoragePersistence()).resolves.toBeUndefined();
    expect(await db.setting.count({ where: { key: "system.storage" } })).toBe(0);
  });
});
