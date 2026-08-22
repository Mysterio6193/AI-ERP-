#!/bin/sh
set -e

if [ -z "$DATABASE_URL" ]; then
  DATABASE_URL="file:$(pwd)/db/dev.db"
fi

export NODE_ENV=production
export DATABASE_URL

node .next/standalone/server.js 2>&1 | tee server.log
