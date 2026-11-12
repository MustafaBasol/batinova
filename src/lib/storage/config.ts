/**
 * Storage configuration (owner: architect-security). Pure: no I/O, no secrets in messages.
 *   STORAGE_DRIVER=local (default) -> MEDIA_STORAGE_DIR / PRIVATE_STORAGE_DIR on a PERSISTENT, VERIFIED directory
 *   STORAGE_DRIVER=s3              -> S3-compatible bucket (provider chosen by the owner; see docs/DEPLOYMENT.md)
 */
export type StorageDriverKind = "local" | "s3";

export function storageDriverKind(env: Record<string, string | undefined> = process.env): StorageDriverKind {
  return env.STORAGE_DRIVER === "s3" ? "s3" : "local";
}

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  /** Optional base prefix inside the bucket (no leading/trailing slash). */
  prefix: string;
}

export function s3ConfigFromEnv(env: Record<string, string | undefined> = process.env): S3Config {
  const problems = s3Problems(env);
  if (problems.length) throw new Error(`Invalid S3 storage configuration — ${problems.join("; ")}.`);
  return {
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION || "auto",
    bucket: env.S3_BUCKET!,
    accessKeyId: env.S3_ACCESS_KEY_ID!,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    prefix: (env.S3_PREFIX ?? "").replace(/^\/+|\/+$/g, ""),
  };
}

export function s3Problems(env: Record<string, string | undefined>): string[] {
  const p: string[] = [];
  for (const name of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"] as const) {
    if (!env[name]) p.push(`${name}: is required when STORAGE_DRIVER=s3`);
  }
  if (env.S3_ENDPOINT) {
    try {
      const u = new URL(env.S3_ENDPOINT);
      if (u.protocol !== "https:" && env.ALLOW_EPHEMERAL_PATHS !== "true") p.push("S3_ENDPOINT: must use https");
    } catch {
      p.push("S3_ENDPOINT: is not a valid URL");
    }
  }
  if (env.S3_FORCE_PATH_STYLE !== undefined && env.S3_FORCE_PATH_STYLE !== "true" && env.S3_FORCE_PATH_STYLE !== "false") {
    p.push('S3_FORCE_PATH_STYLE: must be "true" or "false"');
  }
  if (env.S3_PREFIX && !/^[a-z0-9][a-z0-9/_-]{0,60}$/i.test(env.S3_PREFIX.replace(/^\/+|\/+$/g, ""))) p.push("S3_PREFIX: invalid characters");
  return p;
}
