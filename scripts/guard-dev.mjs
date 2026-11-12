// Refuses to run destructive DB scripts outside development.
if (process.env.NODE_ENV === "production" || process.env.ALLOW_DB_RESET !== "true") {
  console.error("Refusing to run a destructive database command (needs ALLOW_DB_RESET=true and NODE_ENV!=production).");
  process.exit(1);
}
const url = process.env.DATABASE_URL ?? "mysql://root@127.0.0.1:3306/batinova_dev";
let host = "";
let database = "";
try {
  const u = new URL(url);
  host = u.hostname;
  database = u.pathname.replace(/^\//, "");
} catch {
  /* handled below */
}
if (!["127.0.0.1", "localhost", "::1"].includes(host) || !/(dev|test)/i.test(database)) {
  console.error("db:reset is only allowed against a local database (127.0.0.1) whose name contains \"dev\" or \"test\".");
  console.error("Hostinger production databases must never be reset: restore from a backup instead (docs/DEPLOYMENT.md).");
  process.exit(1);
}
