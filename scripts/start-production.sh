#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. Refusing to start." >&2
  echo "Set it to postgresql://user:pass@host:5432/supplysure?schema=public" >&2
  exit 1
fi

export NODE_ENV=production
export DATABASE_URL

# Ensure the database is migrated before serving traffic.
npx prisma migrate deploy 2>&1 | tee -a server.log

node .next/standalone/server.js 2>&1 | tee -a server.log
