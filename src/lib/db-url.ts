/**
 * MySQL/MariaDB connection settings parsed from DATABASE_URL (owner: architect-security).
 * Pure (no I/O): shared by the app client (src/lib/db.ts), the CLI script client
 * (prisma/seed/client.ts) and production env validation.
 *
 * Accepted: mysql://USER:PASSWORD@HOST:PORT/DATABASE  (USER/PASSWORD percent-encoded).
 * Hostinger (Node.js apps): HOST must be 127.0.0.1 — "localhost" resolves to ::1 on Node 17+
 * and is rejected by the MySQL grants. Query params: `connectionLimit` (default 5, max 20), `ssl=true`.
 */
export interface DbConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
  ssl: boolean;
}

export function parseDatabaseUrl(raw: string | undefined): DbConnectionConfig {
  if (!raw) throw new Error("DATABASE_URL is not set (expected mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE).");
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("DATABASE_URL is not a valid URL (percent-encode special characters in the password).");
  }
  if (u.protocol !== "mysql:" && u.protocol !== "mariadb:") {
    throw new Error("DATABASE_URL must start with mysql:// (MySQL/MariaDB).");
  }
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!u.hostname || !u.username || !database) {
    throw new Error("DATABASE_URL must include user, host and database name.");
  }
  const limit = Number(u.searchParams.get("connectionLimit") ?? "5");
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database,
    connectionLimit: Number.isInteger(limit) && limit >= 1 && limit <= 20 ? limit : 5,
    ssl: u.searchParams.get("ssl") === "true",
  };
}

/**
 * Connection options for the `mariadb` driver. MySQL 8 authenticates with caching_sha2_password; without TLS the
 * driver needs `allowPublicKeyRetrieval`. That is acceptable ONLY on the loopback interface (Hostinger: 127.0.0.1),
 * where the exchange never leaves the machine; for any other host TLS (`ssl=true`) is required instead.
 */
export function toConnectionOptions(c: DbConnectionConfig) {
  const loopback = c.host === "127.0.0.1" || c.host === "::1";
  return {
    host: c.host,
    port: c.port,
    user: c.user,
    password: c.password,
    database: c.database,
    timezone: "Z",
    allowPublicKeyRetrieval: loopback,
    ...(c.ssl ? { ssl: true } : {}),
  };
}

/** Options for `new PrismaMariaDb(...)`. UTC everywhere: the app stores and reads UTC instants. */
export function toAdapterConfig(c: DbConnectionConfig) {
  return { ...toConnectionOptions(c), connectionLimit: c.connectionLimit };
}
