import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest, hasRole } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { checkEnvironment } from "@/lib/env-guard"

/**
 * Liveness and readiness.
 *
 * Anonymous callers get a bare ok/not-ok suitable for a load balancer probe.
 * Admins get the configuration detail, because listing which secrets are
 * missing is a map of how to attack the deployment.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const started = Date.now()

  let databaseOk = false
  let databaseError: string | null = null

  try {
    await db.$queryRaw`SELECT 1`
    databaseOk = true
  } catch (error) {
    databaseError = error instanceof Error ? error.message : "Database unreachable"
  }

  const issues = checkEnvironment()
  const fatal = issues.filter((issue) => issue.level === "fatal")
  const healthy = databaseOk && fatal.length === 0

  const user = await getAdminUserFromRequest(request)

  if (!hasRole(user, ["admin"])) {
    return NextResponse.json(
      { status: healthy ? "ok" : "degraded" },
      { status: healthy ? 200 : 503 }
    )
  }

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checkedInMs: Date.now() - started,
      database: { ok: databaseOk, error: databaseError },
      environment: {
        nodeEnv: process.env.NODE_ENV || "development",
        issues: issues.map((issue) => ({
          level: issue.level,
          key: issue.key,
          message: issue.message,
        })),
      },
    },
    { status: healthy ? 200 : 503 }
  )
}
