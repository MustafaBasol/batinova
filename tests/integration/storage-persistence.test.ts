import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  MARKER_FILE,
  StoragePersistenceError,
  initStorageRoot,
  listCanaries,
  readMarker,
  verifyLocalStorage,
  writeCanary,
  type RecordStore,
  type StorageRecord,
} from "@/lib/storage/persistence";

const base = mkdtempSync(path.join(tmpdir(), "btnv-persist-"));
afterAll(() => rmSync(base, { recursive: true, force: true }));

let n = 0;
let roots: { pub: string; priv: string };
let rec: StorageRecord | null;
const store: RecordStore = { get: async () => rec, set: async (r) => void (rec = r) };
beforeEach(() => {
  n += 1;
  roots = { pub: path.join(base, `d${n}`, "media"), priv: path.join(base, `d${n}`, "private") };
  rec = null;
});

describe("storage persistence guard", () => {
  it("initialises markers + deny-all .htaccess on a fresh install and records the ids", async () => {
    expect(await verifyLocalStorage(roots, store)).toBe("initialised");
    const m = await readMarker(roots.pub);
    const p = await readMarker(roots.priv);
    expect(rec).toEqual({ mediaId: m!.id, privateId: p!.id });
    expect(m!.id).not.toBe(p!.id);
    expect(readFileSync(path.join(roots.pub, ".htaccess"), "utf8")).toMatch(/Require all denied/);
  });

  it("verifies on later starts (deployment keeps the directories)", async () => {
    await verifyLocalStorage(roots, store);
    expect(await verifyLocalStorage(roots, store)).toBe("verified");
  });

  it("REFUSES to start when the database knows the storage but the directories were wiped", async () => {
    await verifyLocalStorage(roots, store);
    rmSync(path.dirname(roots.pub), { recursive: true, force: true });
    await expect(verifyLocalStorage(roots, store)).rejects.toThrow(StoragePersistenceError);
    // ...and it must NOT silently re-create anything
    expect(existsSync(path.join(roots.pub, MARKER_FILE))).toBe(false);
  });

  it("refuses when one root lost its marker or when ids mismatch (wrong restore)", async () => {
    await verifyLocalStorage(roots, store);
    rmSync(path.join(roots.priv, MARKER_FILE));
    await expect(verifyLocalStorage(roots, store)).rejects.toThrow(/NOT found/);
    await initStorageRoot(roots.priv, "private", "ffffffff-ffff-ffff-ffff-ffffffffffff");
    await expect(verifyLocalStorage(roots, store)).rejects.toThrow(/do not match/);
  });

  it("refuses when markers are missing and the database record cannot be read", async () => {
    const broken: RecordStore = { get: async () => { throw new Error("db down"); }, set: async () => undefined };
    await expect(verifyLocalStorage(roots, broken)).rejects.toThrow(/cannot be read/);
  });

  it("adopts existing markers when the database has no record yet (restore into a new database)", async () => {
    await verifyLocalStorage(roots, store);
    const old = rec!;
    rec = null;
    expect(await verifyLocalStorage(roots, store)).toBe("initialised");
    expect(rec).toEqual(old);
  });

  it("canaries survive and are listed in order", async () => {
    await initStorageRoot(roots.pub, "media");
    await writeCanary(roots.pub, new Date("2026-11-12T10:00:00Z"));
    await writeCanary(roots.pub, new Date("2026-11-12T11:00:00Z"));
    expect(await listCanaries(roots.pub)).toHaveLength(2);
    expect(await listCanaries(roots.priv)).toEqual([]);
  });
});
