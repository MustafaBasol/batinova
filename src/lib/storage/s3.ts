import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { assertValidStorageKey, type StorageDriver } from "./driver";
import type { S3Config } from "./config";

/**
 * S3-compatible driver (owner: architect-security). Same key rules and contract as LocalDiskDriver.
 * The bucket MUST be private (block public access): public media is streamed by GET /media/<key>
 * and private attachments only by the authenticated admin route — the bucket is never exposed.
 * Public and private objects live under distinct prefixes ("media/" and "private/").
 * Credentials come from the environment only and are never logged.
 */
export class S3Driver implements StorageDriver {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly base: string;

  constructor(cfg: S3Config, scope: "media" | "private", client?: S3Client) {
    this.bucket = cfg.bucket;
    this.base = [cfg.prefix, scope].filter(Boolean).join("/");
    const conf: S3ClientConfig = {
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    };
    this.client = client ?? new S3Client(conf);
  }

  /** Validated key -> full object key. */
  private objectKey(key: string): string {
    assertValidStorageKey(key);
    return `${this.base}/${key}`;
  }

  async put(key: string, data: Buffer | Uint8Array, mime: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key), Body: data, ContentType: mime, ContentLength: data.byteLength }),
    );
    return { key, size: data.byteLength };
  }

  async getStream(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
      if (!res.Body) return null;
      const stream = res.Body.transformToWebStream() as ReadableStream<Uint8Array>;
      return { stream, size: res.ContentLength ?? 0 };
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async read(key: string) {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
  }

  async exists(key: string) {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: this.objectKey(key) }));
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.$metadata?.httpStatusCode === 404;
}
