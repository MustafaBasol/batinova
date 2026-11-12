// Refuses to run destructive DB scripts outside development.
if (process.env.NODE_ENV === "production" || process.env.ALLOW_DB_RESET === "false") {
  console.error("Refusing to run a destructive database command with NODE_ENV=production.");
  process.exit(1);
}
const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
if (!url.startsWith("file:")) {
  console.error("db:reset is only allowed against a local SQLite file database.");
  process.exit(1);
}
