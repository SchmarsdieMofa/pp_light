#!/bin/sh
set -e
if [ "$1" = "smtp:check" ]; then
  exec node scripts/smtp-check.mjs
fi
if [ "$1" = "worker" ]; then
  exec node scripts/worker.mjs
fi
node scripts/migrate.mjs
node scripts/setup-code.mjs
exec node server.js
