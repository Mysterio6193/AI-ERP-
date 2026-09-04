#!/bin/sh
# ==============================================================================
# Dev container entrypoint — reconcile, then hand over to the dev server.
#
# The container's node_modules lives on a named volume so it shadows the host's
# copy, which was built against a different libc and Prisma engine target. That
# shadowing has a cost: the volume outlives image rebuilds, so a package-lock
# change would otherwise leave you running yesterday's dependencies with no
# visible sign of it. Same for the generated Prisma client after a schema edit.
#
# So the volume carries a stamp of what produced it, and a mismatch means
# reinstall. The point is that `docker compose up` is the only command anyone
# has to remember — there is no "did you rebuild?" step to forget.
# ==============================================================================
set -eu

log() { printf '\033[36m[dev]\033[0m %s\n' "$*"; }

DEPS_STAMP=/app/node_modules/.stamp-deps
PRISMA_STAMP=/app/node_modules/.stamp-prisma

stamp_of() { md5sum "$1" | cut -d' ' -f1; }
stamped()  { cat "$1" 2>/dev/null || echo none; }

reconcile_deps() {
  want=$(stamp_of /app/package-lock.json)
  have=$(stamped "$DEPS_STAMP")

  if [ "$want" = "$have" ]; then
    log "dependencies match package-lock.json"
    return
  fi

  if [ "$have" = none ]; then
    log "node_modules volume is empty or unstamped — installing"
  else
    log "package-lock.json changed since this volume was built — reinstalling"
  fi

  npm ci --include=dev
  printf '%s' "$want" > "$DEPS_STAMP"
}

reconcile_prisma() {
  want=$(stamp_of /app/prisma/schema.prisma)
  have=$(stamped "$PRISMA_STAMP")

  if [ "$want" = "$have" ]; then
    log "Prisma client matches schema.prisma"
    return
  fi

  log "generating Prisma client"
  npx prisma generate
  printf '%s' "$want" > "$PRISMA_STAMP"
}

# The lock serialises the two dev services, which share the node_modules volume.
# An `npm ci` that deletes node_modules while the other app is booting is a
# confusing failure to debug; the second service through the lock sees the fresh
# stamps and skips the work instead of repeating it.
#
# It has to live on the shared volume. A lock under /tmp is private to each
# container, so it serialised nothing: both services ran `npm ci` into the same
# volume at the same instant and the competing downloads timed out.
exec 9> /app/node_modules/.install-lock
flock 9
reconcile_deps
reconcile_prisma
exec 9>&-

# --- database -----------------------------------------------------------------
# Only the core app has a DATABASE_URL. The driver PWA reaches the ERP over
# CORE_APP_URL and never opens a database connection, so it skips all of this.
if [ -n "${DATABASE_URL:-}" ]; then
  host=${DB_HOST:-db}
  port=${DB_PORT:-5432}

  log "waiting for postgres at ${host}:${port}"
  waited=0
  until nc -z "$host" "$port" 2>/dev/null; do
    waited=$((waited + 2))
    if [ "$waited" -ge 120 ]; then
      log "postgres did not accept connections within 120s — giving up"
      exit 1
    fi
    sleep 2
  done
  log "postgres is accepting connections"

  # `db push` rather than `migrate deploy`, matching the repo's own db:push
  # script: in development the schema is edited directly and pushed. Unlike the
  # entrypoint this replaces, the failure is not swallowed with `|| true` — a
  # schema that cannot be applied is precisely why the app is about to
  # misbehave, and hiding it only moves the confusion downstream.
  log "applying schema (prisma db push)"
  npx prisma db push --skip-generate --accept-data-loss
fi

log "starting: $*"
exec "$@"
