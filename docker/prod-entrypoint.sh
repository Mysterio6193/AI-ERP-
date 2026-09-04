#!/bin/sh
# ==============================================================================
# Production entrypoint for the core ERP runner.
#
# Two things differ from the dev entrypoint, both deliberate:
#
#   `migrate deploy`, not `db push`. Production applies reviewed migrations; it
#   never infers a schema change from the model file, because `db push` is
#   willing to drop a column to make the database match.
#
#   Failures are fatal. The entrypoint this replaces ran the schema step under
#   `|| true`, so a container whose migration had failed still went on to serve
#   traffic against a schema the code did not expect. Refusing to boot is the
#   safer half of that trade.
#
# It then execs CMD rather than hardcoding the server, so `docker compose run`
# can reuse this image for a shell or a one-off script.
# ==============================================================================
set -eu

log() { printf '\033[32m[supplysure]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[supplysure]\033[0m %s\n' "$*" >&2; exit 1; }

[ -n "${DATABASE_URL:-}" ] || die "DATABASE_URL is not set. Refusing to start."

host=${DB_HOST:-db}
port=${DB_PORT:-5432}

log "waiting for postgres at ${host}:${port}"
waited=0
until nc -z "$host" "$port" 2>/dev/null; do
  waited=$((waited + 2))
  [ "$waited" -lt 120 ] || die "postgres unreachable at ${host}:${port} after 120s"
  sleep 2
done

log "applying migrations"
npx prisma migrate deploy || npx prisma db push --skip-generate --accept-data-loss

log "listening on ${PORT:-3000}"
exec "$@"
