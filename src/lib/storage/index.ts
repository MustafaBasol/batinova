import "server-only";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { StorageDriver } from "./driver";
import { LocalDiskDriver } from "./local-disk";

export * from "./driver";
export { LocalDiskDriver } from "./local-disk";

/**
 * Storage access (owner: architect-security).
 *   getPublicStorage()  — CMS media (images); served by /media/<key>
 *   getPrivateStorage() — lead attachments; NEVER served publicly
 * The two roots must differ and must not be nested in each other or in /public.
 */
let publicDriver: StorageDriver | null = null;
let privateDriver: StorageDriver | null = null;

function roots() {
  const pub = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_STORAGE_DIR || "./storage/media");
  const priv = path.resolve(/*turbopackIgnore: true*/ process.env.PRIVATE_STORAGE_DIR || "./storage/private");
  const inside = (a: string, b: string) => {
    const rel = path.relative(b, a);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  if (inside(pub, priv) || inside(priv, pub)) {
    throw new Error("MEDIA_STORAGE_DIR and PRIVATE_STORAGE_DIR must be separate, non-nested directories.");
  }
  if (inside(priv, path.resolve(/*turbopackIgnore: true*/ "public")) || inside(pub, path.resolve(/*turbopackIgnore: true*/ "public"))) {
    throw new Error("Storage directories must not live inside /public.");
  }
  return { pub, priv };
}

export function getPublicStorage(): StorageDriver {
  publicDriver ??= new LocalDiskDriver(roots().pub);
  return publicDriver;
}

export function getPrivateStorage(): StorageDriver {
  privateDriver ??= new LocalDiskDriver(roots().priv);
  return privateDriver;
}

/** Test helper. */
export function resetStorageDrivers(): void {
  publicDriver = null;
  privateDriver = null;
}

/** Generates a non-guessable key: "<yyyy>/<mm>/<24 hex>[-suffix].<ext>". */
export function generateStorageKey(ext: string, opts: { suffix?: string; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const e = ext.toLowerCase().replace(/^\./, "");
  if (!/^[a-z0-9]{1,8}$/.test(e)) throw new Error("Invalid extension");
  const suffix = opts.suffix ? `-${opts.suffix.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16)}` : "";
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}/${mm}/${randomBytes(12).toString("hex")}${suffix}.${e}`;
}

/** Strips paths/control chars from a user-supplied filename for display/storage in DB. */
export function sanitizeOriginalName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "fichier";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
  return cleaned || "fichier";
}
