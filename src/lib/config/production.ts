import path from "node:path";

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

  if (env.ALLOW_EPHEMERAL_PATHS !== "true") {
    const db = env.DATABASE_URL ?? "";
    if (!db.startsWith("file:")) bad("DATABASE_URL", "must be a file: URL (SQLite) on a persistent volume");
    else if (!path.isAbsolute(db.slice("file:".length).split("?")[0] ?? "")) bad("DATABASE_URL", "must be an absolute path on a persistent volume");
    for (const name of ["MEDIA_STORAGE_DIR", "PRIVATE_STORAGE_DIR"] as const) {
      const v = env[name];
      if (!v) bad(name, "is required in production");
      else if (!path.isAbsolute(v)) bad(name, "must be an absolute path on a persistent volume");
    }
  }
  return problems;
}

export function assertProductionEnv(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const problems = productionEnvProblems(env);
  if (problems.length) throw new Error(`Invalid production environment — ${problems.join("; ")}. See .env.example / docs/DEPLOYMENT.md.`);
}
