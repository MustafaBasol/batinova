import path from "node:path";
import { parseDatabaseUrl } from "@/lib/db-url";
import { s3Problems, storageDriverKind } from "@/lib/storage/config";

/**
 * Production environment validation (owner: architect-security). Pure (no I/O, no secrets in
 * messages: variable NAMES and reasons only). Used by `serverEnv()` and by `src/instrumentation.ts`
 * so a misconfigured production process refuses to start instead of silently degrading
 * (e.g. SITE_URL silently falling back to https://btnv.fr, weak/placeholder secrets,
 * database or media on a relative/ephemeral path).
 *
 * Escape hatch for CI/E2E on a laptop only: ALLOW_EPHEMERAL_PATHS=true skips the "absolute path" rules.
 */
const PLACEHOLDER = /(replace|change[-_ ]?me|placeholder|your[-_ ]|example|todo|xxxx|0000|1234)/i;

export function isWeakSecret(value: string | undefined): string | null {
  if (!value || value.length < 32) return "must be at least 32 characters";
  if (PLACEHOLDER.test(value)) return "looks like a placeholder";
  if (new Set(value).size < 12) return "has too little entropy";
  return null;
}

export function productionEnvProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = [];
  const bad = (name: string, why: string) => problems.push(`${name}: ${why}`);

  for (const name of ["SESSION_SECRET", "IP_HASH_SECRET"] as const) {
    const why = isWeakSecret(env[name]);
    if (why) bad(name, why);
  }
  if (env.SESSION_SECRET && env.SESSION_SECRET === env.IP_HASH_SECRET) bad("IP_HASH_SECRET", "must differ from SESSION_SECRET");

  const site = env.SITE_URL;
  if (!site) bad("SITE_URL", "is required in production");
  else {
    try {
      const u = new URL(site);
      if (u.protocol !== "https:" && env.ALLOW_EPHEMERAL_PATHS !== "true") bad("SITE_URL", "must use https");
      else if (u.pathname !== "/" || u.search || u.hash) bad("SITE_URL", "must be a bare origin (no path/query)");
    } catch {
      bad("SITE_URL", "is not a valid URL");
    }
  }

  if (env.TRUST_PROXY !== undefined && env.TRUST_PROXY !== "true" && env.TRUST_PROXY !== "false") {
    bad("TRUST_PROXY", 'must be "true" or "false"');
  }

  const hops = env.TRUST_PROXY_HOPS;
  if (hops !== undefined && !/^[1-5]$/.test(hops)) bad("TRUST_PROXY_HOPS", "must be an integer between 1 and 5");
  const ipHeader = env.CLIENT_IP_HEADER;
  if (ipHeader && !["x-real-ip", "cf-connecting-ip", "true-client-ip", "x-client-ip"].includes(ipHeader.toLowerCase())) {
    bad("CLIENT_IP_HEADER", "must be one of x-real-ip, cf-connecting-ip, true-client-ip, x-client-ip");
  }
  if (env.MAINTENANCE_TOKEN) {
    const why = isWeakSecret(env.MAINTENANCE_TOKEN);
    if (why) bad("MAINTENANCE_TOKEN", why);
    if (env.MAINTENANCE_TOKEN === env.SESSION_SECRET || env.MAINTENANCE_TOKEN === env.IP_HASH_SECRET) bad("MAINTENANCE_TOKEN", "must differ from the other secrets");
  }
  if (env.SITE_INDEXING === "true" && env.SITE_URL && env.SITE_URL !== "https://btnv.fr" && env.ALLOW_EPHEMERAL_PATHS !== "true") {
    bad("SITE_INDEXING", "may be true only for the canonical origin https://btnv.fr (previews must stay noindex)");
  }

  // Database: Hostinger MySQL. Node.js apps must use 127.0.0.1 ("localhost" resolves to ::1 and is refused).
  try {
    const cfg = parseDatabaseUrl(env.DATABASE_URL);
    const local = cfg.host === "127.0.0.1" || cfg.host === "::1";
    if (cfg.host === "localhost") bad("DATABASE_URL", 'host must be 127.0.0.1, not "localhost" (Node resolves it to ::1)');
    else if (!local && env.ALLOW_EPHEMERAL_PATHS !== "true" && env.ALLOW_REMOTE_DATABASE !== "true") {
      bad("DATABASE_URL", "host must be 127.0.0.1 (set ALLOW_REMOTE_DATABASE=true only for a deliberate remote MySQL with TLS)");
    }
    if (!cfg.password && env.ALLOW_EPHEMERAL_PATHS !== "true") bad("DATABASE_URL", "must include a password");
  } catch (e) {
    // parseDatabaseUrl messages never contain the URL or password.
    bad("DATABASE_URL", e instanceof Error ? e.message : "is invalid");
  }

  if (env.STORAGE_DRIVER !== undefined && env.STORAGE_DRIVER !== "local" && env.STORAGE_DRIVER !== "s3") {
    bad("STORAGE_DRIVER", 'must be "local" or "s3"');
  }
  if (storageDriverKind(env) === "s3") problems.push(...s3Problems(env));

  if (storageDriverKind(env) === "local" && env.ALLOW_EPHEMERAL_PATHS !== "true") {
    for (const name of ["MEDIA_STORAGE_DIR", "PRIVATE_STORAGE_DIR"] as const) {
      const v = env[name];
      if (!v) bad(name, "is required in production");
      else if (!path.isAbsolute(v)) bad(name, "must be an absolute path on a persistent volume outside the deployment folders");
      else if (/(^|\/)(hbuilds|public_html)(\/|$)/.test(v)) bad(name, "must not be inside hbuilds/ or public_html/ (overwritten on every deployment)");
    }
    if (env.MEDIA_STORAGE_DIR && env.PRIVATE_STORAGE_DIR && env.MEDIA_STORAGE_DIR === env.PRIVATE_STORAGE_DIR) {
      bad("PRIVATE_STORAGE_DIR", "must differ from MEDIA_STORAGE_DIR");
    }
  }
  return problems;
}

export function assertProductionEnv(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const problems = productionEnvProblems(env);
  if (problems.length) throw new Error(`Invalid production environment — ${problems.join("; ")}. See .env.example / docs/DEPLOYMENT.md.`);
}
