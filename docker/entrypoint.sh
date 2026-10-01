#!/bin/sh
set -e
if [ "$1" = "worker" ]; then
  exec node scripts/worker.mjs
fi
node scripts/migrate.mjs
exec node server.js
