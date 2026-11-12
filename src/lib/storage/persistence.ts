import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Persistence guard for LOCAL storage (owner: architect-security).
 *
 * Hostinger overwrites hbuilds/ and public_html on every deployment and keeps only the last two builds, so a
 * storage root is acceptable ONLY if it survives deployments. Instead of trusting the path, every root carries a
 * marker file with a random id; the same ids are recorded in the database (Setting `system.storage`). At every
 * production start:
 *   - marker present + same id as the database       -> OK (continuity proven across deployments)
 *   - marker missing but database has a record        -> the directory was wiped / not mounted: REFUSE TO START
 *   - marker missing and no database record (fresh)   -> initialise the marker and record the ids
 * A canary (`.canary/<timestamp>`) can additionally be written before a deployment and checked after it
 * (`npm run storage:canary -- write|check`).
 */
export const MARKER_FILE = ".batinova-storage.json";
export const CANARY_DIR = ".canary";

export interface StorageMarker {
  version: 1;
  id: string;
  scope: "media" | "private";
  createdAt: string;
}

export class StoragePersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoragePersistenceError";
  }
}

export async function readMarker(root: string): Promise<StorageMarker | null> {
  try {
    const m = JSON.parse(await readFile(path.join(root, MARKER_FILE), "utf8")) as StorageMarker;
    return m && m.version === 1 && typeof m.id === "string" && m.id.length >= 16 ? m : null;
  } catch {
    return null;
  }
}

/** Creates the directory (0700), a deny-all .htaccess (defence in depth if ever mapped under a web root) and the marker. */
export async function initStorageRoot(root: string, scope: StorageMarker["scope"], id?: string): Promise<StorageMarker> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700).catch(() => undefined);
  await writeFile(path.join(root, ".htaccess"), "Require all denied\nDeny from all\n", { flag: "w", mode: 0o600 });
  const existing = await readMarker(root);
  if (existing) return existing;
  const marker: StorageMarker = { version: 1, id: id ?? randomUUID(), scope, createdAt: new Date().toISOString() };
  await writeFile(path.join(root, MARKER_FILE), JSON.stringify(marker), { flag: "wx", mode: 0o600 });
  return marker;
}

/** The directory must be writable by the app user (probe file is removed immediately). */
export async function assertWritable(root: string): Promise<void> {
  const probe = path.join(root, `.probe-${randomUUID()}`);
  try {
    await writeFile(probe, "ok", { flag: "wx" });
    await rm(probe, { force: true });
  } catch {
    throw new StoragePersistenceError(`Storage directory is missing or not writable (${scopeLabel(root)}).`);
  }
}

const scopeLabel = (root: string) => path.basename(root);

export interface StorageRecord {
  mediaId: string;
  privateId: string;
}

export interface RecordStore {
  get(): Promise<StorageRecord | null>;
  set(r: StorageRecord): Promise<void>;
}

/**
 * Startup verification. `store` is the database record (injected for tests / script use).
 * Never prints paths of secrets; messages name the scope only.
 */
export async function verifyLocalStorage(roots: { pub: string; priv: string }, store: RecordStore | null): Promise<"verified" | "initialised"> {
  for (const r of [roots.pub, roots.priv]) {
    try {
      const s = await stat(r);
      if (!s.isDirectory()) throw new Error("not a directory");
    } catch {
      // Directory missing entirely: only acceptable on a verified-fresh install (no DB record yet).
    }
  }
  const pubMarker = await readMarker(roots.pub);
  const privMarker = await readMarker(roots.priv);
  let record: StorageRecord | null = null;
  try {
    record = store ? await store.get() : null;
  } catch {
    if (!pubMarker || !privMarker) {
      throw new StoragePersistenceError("Storage markers are missing and the database record cannot be read: refusing to start.");
    }
  }

  if (record) {
    if (!pubMarker || !privMarker) {
      throw new StoragePersistenceError(
        "Persistent storage was NOT found although the database knows it (deployment wiped it or it is not mounted). Refusing to start to avoid silent data loss. Restore the storage directories from backup.",
      );
    }
    if (pubMarker.id !== record.mediaId || privMarker.id !== record.privateId) {
      throw new StoragePersistenceError("Storage markers do not match the database record (wrong directory or mismatched restore). Refusing to start.");
    }
    await assertWritable(roots.pub);
    await assertWritable(roots.priv);
    return "verified";
  }

  // No database record: fresh install, or markers exist from a previous run (adopt them).
  const pub = await initStorageRoot(roots.pub, "media", pubMarker?.id);
  const priv = await initStorageRoot(roots.priv, "private", privMarker?.id);
  await assertWritable(roots.pub);
  await assertWritable(roots.priv);
  if (store) await store.set({ mediaId: pub.id, privateId: priv.id });
  return "initialised";
}

// ---- canary (deployment persistence test) ----------------------------------------------------------------

export async function writeCanary(root: string, now = new Date()): Promise<string> {
  const dir = path.join(root, CANARY_DIR);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const name = now.toISOString().replace(/[:.]/g, "-");
  await writeFile(path.join(dir, name), `canary ${randomUUID()}`, { flag: "wx", mode: 0o600 });
  return name;
}

export async function listCanaries(root: string): Promise<string[]> {
  try {
    return (await readdir(path.join(root, CANARY_DIR))).sort();
  } catch {
    return [];
  }
}
