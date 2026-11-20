#!/usr/bin/env bash
# Nightly backup of Water Investment Projects (M8): a database dump and all uploaded files, in one archive.
# Runs on the server as root, from cron (docs/DEPLOYMENT.md, "Backups"). Keeps BACKUP_KEEP_DAYS days locally and,
# when BACKUP_REMOTE is set, copies the archives off the server (for example to a Hetzner Storage Box).
#
# Settings (environment, all optional):
#   APP_DIR               folder with compose.production.yml and .env   (default: the folder above this script)
#   BACKUP_DIR            where archives are kept                       (default: /var/backups/waterinvest)
#   BACKUP_KEEP_DAYS      days to keep local archives                    (default: 35)
#   BACKUP_REMOTE         rsync target, e.g. u123456@u123456.your-storagebox.de:waterinvest
#   BACKUP_REMOTE_PORT    ssh port for BACKUP_REMOTE                     (default: 23, Hetzner Storage Box)
#   BACKUP_AGE_RECIPIENT  age public key; when set, archives are encrypted (apt install age)

set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/waterinvest}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-35}"
REMOTE="${BACKUP_REMOTE:-}"
REMOTE_PORT="${BACKUP_REMOTE_PORT:-23}"
AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-}"

cd "$APP_DIR"
compose() { docker compose -f compose.production.yml "$@"; }

umask 077
mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d "$BACKUP_DIR/.work-XXXXXX")"
trap 'rm -rf "$work"' EXIT

# 1. Database: a consistent snapshot in pg_dump's custom format, checked by listing its contents.
compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' >"$work/db.dump"
compose exec -T db pg_restore --list <"$work/db.dump" >/dev/null

# 2. Uploaded teasers, read from the app's volume.
compose exec -T app tar -C /app/.data -cf - blobs >"$work/blobs.tar"

archive="$BACKUP_DIR/waterinvest-$stamp.tar.gz"
tar -C "$work" -czf "$archive" db.dump blobs.tar
if [ -n "$AGE_RECIPIENT" ]; then
  age -r "$AGE_RECIPIENT" -o "$archive.age" "$archive"
  rm -f "$archive"
  archive="$archive.age"
fi
echo "backup: wrote $archive ($(du -h "$archive" | cut -f1))"

# 3. Keep KEEP_DAYS days locally.
find "$BACKUP_DIR" -maxdepth 1 -name 'waterinvest-*' -mtime +"$KEEP_DAYS" -delete

# 4. Copy off the server (the remote keeps whatever the local folder has).
if [ -n "$REMOTE" ]; then
  rsync -a --delete -e "ssh -p $REMOTE_PORT" --include='waterinvest-*' --exclude='*' \
    "$BACKUP_DIR/" "$REMOTE/"
  echo "backup: copied to $REMOTE"
fi
