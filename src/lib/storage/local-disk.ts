import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { randomBytes } from "node:crypto";
import { InvalidStorageKeyError, assertValidStorageKey, type StorageDriver } from "./driver";

/**
 * Local filesystem driver with path-traversal protection
 * (owner: architect-security). `root` must be a persistent volume in production.
 */
export class LocalDiskDriver implements StorageDriver {
  readonly name = "local-disk";
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Resolves a key to an absolute path strictly inside root, or throws. */
  resolveKey(key: string): string {
    assertValidStorageKey(key);
    const full = path.resolve(this.root, ...key.split("/"));
    const rel = path.relative(this.root, full);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new InvalidStorageKeyError();
    return full;
  }

  async put(key: string, data: Buffer | Uint8Array, _mime?: string) {
    void _mime; // local disk derives the type from the key extension
    const full = this.resolveKey(key);
    await mkdir(path.dirname(full), { recursive: true });
    // atomic-ish write: temp file then rename
    const tmp = `${full}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(tmp, data, { flag: "wx" });
    await rename(tmp, full);
    return { key, size: data.byteLength };
  }

  async getStream(key: string) {
    const full = this.resolveKey(key);
    try {
      const s = await stat(full);
      if (!s.isFile()) return null;
      const stream = Readable.toWeb(createReadStream(full)) as unknown as ReadableStream<Uint8Array>;
      return { stream, size: s.size };
    } catch {
      return null;
    }
  }

  async read(key: string) {
    const full = this.resolveKey(key);
    try {
      return await readFile(full);
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.resolveKey(key), { force: true });
  }

  async exists(key: string) {
    try {
      return (await stat(this.resolveKey(key))).isFile();
    } catch (err) {
      if (err instanceof InvalidStorageKeyError) throw err;
      return false;
    }
  }
}
