#!/bin/sh
# pp_light backups: database dump + attachments into /backups/<timestamp>/, old ones are pruned.
#   backup.sh          run daily at BACKUP_HOUR (default 2 o'clock), keep BACKUP_KEEP_DAYS days (default 14)
#   backup.sh now      one backup right away
#   backup.sh restore <timestamp>   restore that backup (stop app and worker first!)
set -eu
BACKUP_HOUR="${BACKUP_HOUR:-2}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
export PGHOST=postgres PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"

backup() {
  stamp=$(date +%Y-%m-%d_%H%M)
  tmp="/backups/.unfinished-$stamp"
  rm -rf "$tmp" && mkdir -p "$tmp"
  pg_dump --format=custom --file="$tmp/db.dump"
  tar -czf "$tmp/uploads.tar.gz" -C /uploads .
  # Only complete backups get a real name; a crash leaves a .unfinished-* folder behind.
  rm -rf "/backups/$stamp" && mv "$tmp" "/backups/$stamp"
  find /backups -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$BACKUP_KEEP_DAYS" -exec rm -rf {} +
  echo "$(date '+%F %T') Backup fertig: $stamp ($(du -sh "/backups/$stamp" | cut -f1))"
}

restore() {
  dir="/backups/${1:?Welches Backup? z. B. restore 2026-10-02_0200}"
  [ -f "$dir/db.dump" ] && [ -f "$dir/uploads.tar.gz" ] || { echo "Kein vollständiges Backup in $dir" >&2; exit 1; }
  # Restore into a fresh database first; only a complete restore replaces the live one.
  tmpdb="${POSTGRES_DB}_restore"
  psql --dbname=postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$tmpdb\"" -c "CREATE DATABASE \"$tmpdb\""
  pg_restore --no-owner --exit-on-error --dbname="$tmpdb" "$dir/db.dump"
  psql --dbname=postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE \"$POSTGRES_DB\" WITH (FORCE)" -c "ALTER DATABASE \"$tmpdb\" RENAME TO \"$POSTGRES_DB\""
  find /uploads -mindepth 1 -delete
  tar -xzpf "$dir/uploads.tar.gz" -C /uploads
  echo "Wiederhergestellt: $1 – jetzt app und worker wieder starten."
}

case "${1:-loop}" in
  now) backup ;;
  restore) restore "${2:-}" ;;
  loop)
    echo "Tägliches Backup um $BACKUP_HOUR Uhr, Aufbewahrung $BACKUP_KEEP_DAYS Tage."
    while true; do
      if [ "$(expr "$(date +%H)" + 0)" = "$BACKUP_HOUR" ] && [ "$(cat /backups/.last-run 2>/dev/null)" != "$(date +%F)" ]; then
        # A failed run is retried in the next check instead of stopping the loop.
        if backup; then date +%F > /backups/.last-run; fi
      fi
      sleep 300
    done ;;
  *) echo "Aufruf: backup.sh [now | restore <timestamp>]" >&2; exit 1 ;;
esac
