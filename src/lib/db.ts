import { PrismaClient } from '@prisma/client'

import { assertEnvironment } from '@/lib/env-guard'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  envChecked: boolean | undefined
}

// Runs once per process. This module is imported by everything that touches the
// database, which makes it the earliest reliable point to refuse to start on a
// misconfigured production environment.
if (!globalForPrisma.envChecked) {
  globalForPrisma.envChecked = true
  assertEnvironment()
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Query logging is enormously verbose and echoes row data into the log
    // stream, so it stays off unless explicitly asked for.
    log:
      process.env.PRISMA_LOG_QUERIES === 'true'
        ? ['query', 'warn', 'error']
        : process.env.NODE_ENV === 'production'
          ? ['warn', 'error']
          : ['warn', 'error'],
  })

// A warm Vercel function process serves more than one request. Keep one Prisma
// client for that process in production too, rather than paying a fresh pooler
// connection setup for each module evaluation.
globalForPrisma.prisma = db
