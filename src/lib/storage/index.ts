import "server-only";
import { randomBytes } from "node:crypto";
import type { StorageDriver } from "./driver";
import { LocalDiskDriver } from "./local-disk";
import { storageRoots } from "./roots";
import { s3ConfigFromEnv, storageDriverKind } from "./config";
import { S3Driver } from "./s3";

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

const roots = storageRoots;

export function getPublicStorage(): StorageDriver {
  publicDriver ??= storageDriverKind() === "s3" ? new S3Driver(s3ConfigFromEnv(), "media") : new LocalDiskDriver(roots().pub);
  return publicDriver;
}

export function getPrivateStorage(): StorageDriver {
  privateDriver ??= storageDriverKind() === "s3" ? new S3Driver(s3ConfigFromEnv(), "private") : new LocalDiskDriver(roots().priv);
  return privateDriver;
}

export { storageDriverKind } from "./config";
export { storageRoots } from "./roots";

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
