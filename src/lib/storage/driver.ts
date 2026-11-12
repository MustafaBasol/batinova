/**
 * Storage contract (owner: architect-security).
 * Two isolated instances exist (see ./index.ts):
 *  - public  (MEDIA_STORAGE_DIR)   -> served by GET /media/<key>
 *  - private (PRIVATE_STORAGE_DIR) -> lead attachments; NEVER publicly served,
 *    only streamed by an authenticated admin Route Handler.
 * Both directories MUST be persistent volumes in production (not the container FS).
 * A future S3-compatible driver can implement the same interface.
 */
export interface StoredObjectInfo {
  key: string;
  size: number;
}

export interface StorageDriver {
  readonly name: string;
  /** Writes (overwrites) an object. `mime` is advisory for drivers that keep metadata. */
  put(key: string, data: Buffer | Uint8Array, mime: string): Promise<StoredObjectInfo>;
  /** Returns a web ReadableStream + size, or null when the object does not exist. */
  getStream(key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null>;
  /** Reads a whole object into memory (use for small files / processing only). */
  read(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class InvalidStorageKeyError extends Error {
  constructor() {
    super("Invalid storage key");
    this.name = "InvalidStorageKeyError";
  }
}

/**
 * Key rules: 1..6 "/"-separated segments of [a-z0-9._-] (lower-case), no
 * segment equal to "." or "..", no leading dot, max 200 chars.
 * Example: "2026/11/k3j4h5g6f7d8s9a0.webp", "2026/11/k3j4h5g6f7d8s9a0-w640.webp"
 */
const SEGMENT = /^[a-z0-9][a-z0-9._-]{0,99}$/;

export function isValidStorageKey(key: unknown): key is string {
  if (typeof key !== "string" || key.length === 0 || key.length > 200) return false;
  const segs = key.split("/");
  if (segs.length > 6) return false;
  return segs.every((s) => SEGMENT.test(s) && s !== "." && s !== ".." && !s.includes(".."));
}

export function assertValidStorageKey(key: unknown): asserts key is string {
  if (!isValidStorageKey(key)) throw new InvalidStorageKeyError();
}
