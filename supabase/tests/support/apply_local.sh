#!/usr/bin/env bash
# Build a fresh LOCAL scratch database: Supabase stand-in + every migration + seed.
# Usage: PGUSER=<superuser> supabase/tests/support/apply_local.sh [dbname]
# Scratch Postgres only. Never point this at a Supabase project.
set -euo pipefail
DB="${1:-eac_dev}"
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPA="$HERE/../.."
case "$DB" in *prod*|*live*) echo "refusing suspicious db name $DB"; exit 1;; esac
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$HERE/local_supabase_stub.sql"
for f in "$SUPA"/migrations/*.sql; do
  echo "applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$SUPA/seed.sql"
echo "OK: $DB ready"
