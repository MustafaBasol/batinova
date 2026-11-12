import "server-only";
import { z } from "zod";

/**
 * Server-only environment access (owner: architect-security).
 * Parsed lazily so `next build` does not require runtime secrets; secrets are
 * validated on first use and never logged.
 */
const secret = z.string().min(32, "must be at least 32 characters");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1).default("file:./prisma/dev.db"),
  SESSION_SECRET: secret,
  IP_HASH_SECRET: secret,
  MEDIA_STORAGE_DIR: z.string().min(1).default("./storage/media"),
  PRIVATE_STORAGE_DIR: z.string().min(1).default("./storage/private"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().optional(),
  SMTP_SECURE: z.enum(["true", "false"]).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
});

export type ServerEnv = z.infer<typeof EnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Report variable names only — never values.
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server environment: ${names}. See .env.example.`);
  }
  if (parsed.data.SESSION_SECRET === parsed.data.IP_HASH_SECRET) {
    throw new Error("SESSION_SECRET and IP_HASH_SECRET must be distinct.");
  }
  cached = parsed.data;
  return cached;
}

/** Test helper: forget cached env after mutating process.env. */
export function resetServerEnvCache(): void {
  cached = null;
}

export const isProduction = () => process.env.NODE_ENV === "production";
