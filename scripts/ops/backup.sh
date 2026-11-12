#!/usr/bin/env bash
# BatiNova backup (owner: architect-security). MySQL dump + media/private archives, consistent set per run.
#   scripts/ops/backup.sh /home/uXXXX/batinova-private/backup.env
# The env file (chmod 600, OUTSIDE hbuilds/ and public_html/) defines:
#   DATABASE_URL            mysql://USER:PASSWORD@127.0.0.1:3306/DB   (password percent-encoded)
#   MEDIA_STORAGE_DIR, PRIVATE_STORAGE_DIR   (absolute, local driver only)
#   BACKUP_DIR              absolute backup target, e.g. /home/uXXXX/batinova-backups
#   BACKUP_KEEP_DAYS        default 30
#   BACKUP_GPG_RECIPIENT    optional: encrypt archives with this GPG public key (recommended before copying off-site)
# Prints names and sizes only. Dumps contain personal data (leads): treat every file as confidential (umask 077).
set -euo pipefail
umask 077
ENV_FILE="${1:?usage: backup.sh /path/to/backup.env}"
set -a; . "$ENV_FILE"; set +a

parse() { node -e '
  const u = new URL(process.env.DATABASE_URL);
  const q = (s) => "\x27" + s.replace(/\x27/g, "\x27\\\x27\x27") + "\x27";
  console.log("DB_HOST=" + q(u.hostname) + " DB_PORT=" + q(u.port || "3306") + " DB_USER=" + q(decodeURIComponent(u.username)) +
              " DB_PASS=" + q(decodeURIComponent(u.password)) + " DB_NAME=" + q(decodeURIComponent(u.pathname.slice(1))));'; }
eval "$(parse)"

BACKUP_DIR="${BACKUP_DIR:?BACKUP_DIR is required}"
KEEP="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_DIR/$STAMP"
mkdir -p "$DEST"

DUMP="$(command -v mariadb-dump || command -v mysqldump)"
CNF="$(mktemp)"; trap 'rm -f "$CNF"' EXIT
printf '[client]\nhost=%s\nport=%s\nuser=%s\npassword=%s\n' "$DB_HOST" "$DB_PORT" "$DB_USER" "$DB_PASS" > "$CNF"

# --single-transaction: consistent InnoDB snapshot without locking the site.
"$DUMP" --defaults-extra-file="$CNF" --single-transaction --routines --triggers --default-character-set=utf8mb4 "$DB_NAME" | gzip -9 > "$DEST/db.sql.gz"

if [ -n "${MEDIA_STORAGE_DIR:-}" ] && [ -d "$MEDIA_STORAGE_DIR" ]; then
  tar -C "$MEDIA_STORAGE_DIR" -czf "$DEST/media.tar.gz" .
fi
if [ -n "${PRIVATE_STORAGE_DIR:-}" ] && [ -d "$PRIVATE_STORAGE_DIR" ]; then
  tar -C "$PRIVATE_STORAGE_DIR" -czf "$DEST/private.tar.gz" .
fi

( cd "$DEST" && sha256sum * > SHA256SUMS )

if [ -n "${BACKUP_GPG_RECIPIENT:-}" ]; then
  for f in "$DEST"/*.gz; do gpg --batch --yes --trust-model always -r "$BACKUP_GPG_RECIPIENT" -o "$f.gpg" -e "$f" && rm -f "$f"; done
  ( cd "$DEST" && rm -f SHA256SUMS && sha256sum * > SHA256SUMS )
fi

# retention
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP" -exec rm -rf {} +
echo "[backup] $STAMP ok: $(ls "$DEST" | tr '\n' ' ')"
