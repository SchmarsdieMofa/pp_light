#!/bin/sh
set -e
if [ "$1" = "worker" ]; then
  exec node scripts/worker.mjs
fi
node scripts/migrate.mjs
node scripts/setup-code.mjs
exec node server.js
