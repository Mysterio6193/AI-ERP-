#!/bin/sh
set -e

echo "Waiting for PostgreSQL database..."
until nc -z -v -w30 ${DB_HOST:-db} ${DB_PORT:-5432} 2>/dev/null; do
  echo "PostgreSQL is unavailable - sleeping..."
  sleep 2
done

echo "PostgreSQL is ready!"

if [ -n "$DATABASE_URL" ]; then
  echo "Pushing database schema..."
  npx prisma db push --skip-generate || true
fi

echo "Starting SupplySure OS Core ERP on port ${PORT:-3000}..."
exec node server.js
