#!/usr/bin/env bash
# BatiNova restore (owner: architect-security). DESTRUCTIVE: replaces the database content and the storage directories.
#   scripts/ops/restore.sh /home/uXXXX/batinova-private/backup.env /home/uXXXX/batinova-backups/20261112T031700Z --yes
# Without --yes it only verifies checksums and prints what it would do (dry run).
# Procedure (docs/DEPLOYMENT.md §9): put the app in maintenance (stop it in hPanel) -> restore -> `npm run db:status`
# -> start -> `npm run maintenance:purge` (a restore can resurrect purged leads) -> smoke test.
# The storage markers are restored together with the files, so the app's persistence guard stays consistent
# with the restored database record (Setting system.storage). DB and files MUST come from the same backup set.
set -euo pipefail
umask 077
ENV_FILE="${1:?usage: restore.sh ENV_FILE BACKUP_SET_DIR [--yes]}"
SET="${2:?backup set directory required}"
GO="${3:-}"
set -a; . "$ENV_FILE"; set +a
[ -d "$SET" ] || { echo "no such backup set" >&2; exit 2; }
( cd "$SET" && sha256sum -c SHA256SUMS ) || { echo "checksum mismatch: refusing" >&2; exit 3; }
[ -f "$SET/db.sql.gz" ] || { echo "encrypted set: decrypt *.gpg first" >&2; exit 4; }

eval "$(node -e '
  const u = new URL(process.env.DATABASE_URL);
  const q = (s) => "\x27" + s.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
  console.log("DB_HOST=" + q(u.hostname) + " DB_PORT=" + q(u.port || "3306") + " DB_USER=" + q(decodeURIComponent(u.username)) +
              " DB_PASS=" + q(decodeURIComponent(u.password)) + " DB_NAME=" + q(decodeURIComponent(u.pathname.slice(1))));')"

if [ "$GO" != "--yes" ]; then
  echo "[restore] DRY RUN ok: checksums valid. Would replace database '$DB_NAME' and: $(ls "$SET" | tr '\n' ' ')"
  exit 0
fi

CLIENT="$(command -v mariadb || command -v mysql)"
CNF="$(mktemp)"; trap 'rm -f "$CNF"' EXIT
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASS" > "$CNF"

# Keep the current state aside first (never destroy the only copy).
ASIDE="${BACKUP_DIR:-$(dirname "$SET")}/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$ASIDE"
DUMP="$(command -v mariadb-dump || command -v mysqldump)"
"$DUMP" --defaults-extra-file="$CNF" --single-transaction "$DB_NAME" | gzip -9 > "$ASIDE/db.sql.gz" || true

# Empty the database (drop tables, keep the database + grants: Hostinger users cannot always DROP DATABASE).
TABLES="$("$CLIENT" --defaults-extra-file="$CNF" -N -e "SET SESSION group_concat_max_len=1000000; SELECT GROUP_CONCAT(CONCAT('\`',table_name,'\`')) FROM information_schema.tables WHERE table_schema='$DB_NAME'")"
if [ -n "$TABLES" ] && [ "$TABLES" != "NULL" ]; then
  "$CLIENT" --defaults-extra-file="$CNF" "$DB_NAME" -e "SET FOREIGN_KEY_CHECKS=0; DROP TABLE $TABLES; SET FOREIGN_KEY_CHECKS=1;"
fi
gunzip -c "$SET/db.sql.gz" | "$CLIENT" --defaults-extra-file="$CNF" --default-character-set=utf8mb4 "$DB_NAME"

restore_dir() { # archive target
  [ -f "$1" ] || return 0
  [ -n "$2" ] || return 0
  if [ -d "$2" ]; then mv "$2" "$ASIDE/$(basename "$2")"; fi
  mkdir -p "$2"; chmod 700 "$2"
  tar -C "$2" -xzf "$1"
}
restore_dir "$SET/media.tar.gz" "${MEDIA_STORAGE_DIR:-}"
restore_dir "$SET/private.tar.gz" "${PRIVATE_STORAGE_DIR:-}"
echo "[restore] done. Previous state kept in $ASIDE (delete it once the restore is verified)."
