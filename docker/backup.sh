#!/bin/sh
# pp_light backups: database dump + attachments into /backups/<timestamp>/, old ones are pruned.
#   backup.sh          service mode: daily at BACKUP_HOUR (default 2 o'clock) plus runs requested in the web UI
#                      (table backup_runs, checked every 10 seconds); keeps BACKUP_KEEP_DAYS days (default 14)
#   backup.sh now      one backup right away
#   backup.sh restore <timestamp>   restore that backup (stop app and worker first!)
set -eu
BACKUP_HOUR="${BACKUP_HOUR:-2}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
export PGHOST=postgres PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"

# SQL against the app database; prints the result, stays quiet and fails softly while the table does not exist yet.
sql() {
  psql -qtA -v ON_ERROR_STOP=1 "$@" 2>/dev/null
}

backup() {
  stamp=$(date +%Y-%m-%d_%H%M)
  tmp="/backups/.unfinished-$stamp"
  # Explicit checks: `set -e` does not apply while backup runs inside `if`.
  rm -rf "$tmp" && mkdir -p "$tmp" || return 1
  pg_dump --format=custom --file="$tmp/db.dump" || { rm -rf "$tmp"; return 1; }
  tar -czf "$tmp/uploads.tar.gz" -C /uploads . || { rm -rf "$tmp"; return 1; }
  # Only complete backups get a real name.
  rm -rf "/backups/$stamp" && mv "$tmp" "/backups/$stamp" || return 1
  find /backups -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +"$BACKUP_KEEP_DAYS" -exec rm -rf {} +
  BACKUP_NAME="$stamp"
  BACKUP_BYTES=$(( $(du -sk "/backups/$stamp" | cut -f1) * 1024 ))
  echo "$(date '+%F %T') Backup fertig: $stamp ($(du -sh "/backups/$stamp" | cut -f1))"
}

# Runs a backup for the backup_runs row $1 and records the outcome there.
run_logged() {
  id="$1"
  if backup 2>/tmp/backup-error; then
    sql -c "UPDATE backup_runs SET status = 'done', name = '$BACKUP_NAME', size_bytes = $BACKUP_BYTES, finished_at = now() WHERE id = '$id'" || true
    return 0
  fi
  message=$(tail -c 1000 /tmp/backup-error)
  echo "$(date '+%F %T') Backup fehlgeschlagen: $message" >&2
  # psql variables only expand in input from stdin – :'error' quotes the message safely.
  printf "%s" "UPDATE backup_runs SET status = 'failed', error = :'error', finished_at = now() WHERE id = '$id'" |
    sql -v error="${message:-Unbekannter Fehler}" || true
  return 1
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

serve() {
  echo "Tägliches Backup um $BACKUP_HOUR Uhr, Aufbewahrung $BACKUP_KEEP_DAYS Tage; Aufträge aus der Weboberfläche werden alle 10 Sekunden abgeholt."
  # A run that was going when the service stopped will never finish.
  sql -c "UPDATE backup_runs SET status = 'failed', error = 'Abgebrochen: Backup-Dienst wurde neu gestartet.', finished_at = now() WHERE status = 'running'" >/dev/null || true
  while true; do
    # Requested in the web UI?
    id=$(sql -c "UPDATE backup_runs SET status = 'running', started_at = now() WHERE id = (SELECT id FROM backup_runs WHERE status = 'pending' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id" || true)
    [ -n "$id" ] && { run_logged "$id" || true; }

    # Daily run; a failed run is retried at the next check instead of stopping the loop.
    if [ "$(expr "$(date +%H)" + 0)" = "$BACKUP_HOUR" ] && [ "$(cat /backups/.last-run 2>/dev/null)" != "$(date +%F)" ]; then
      id=$(sql -c "INSERT INTO backup_runs (trigger, status, started_at) VALUES ('scheduled', 'running', now()) RETURNING id" || true)
      if [ -n "$id" ]; then
        run_logged "$id" && date +%F > /backups/.last-run || true
      elif backup; then
        # Table not there yet (first start before the app migrated): back up anyway, just unlogged.
        date +%F > /backups/.last-run
      fi
    fi
    sleep 10
  done
}

case "${1:-serve}" in
  now) backup ;;
  restore) restore "${2:-}" ;;
  serve | loop) serve ;;
  *) echo "Aufruf: backup.sh [now | restore <timestamp>]" >&2; exit 1 ;;
esac
