/**
 * Production environment checks.
 *
 * Several secrets have development fallbacks so the app runs out of the box.
 * That is convenient locally and dangerous in production: a deployment missing
 * `ADMIN_SESSION_SECRET` would sign admin sessions with a string that is in the
 * repository, and anyone who has read it could mint an admin token.
 *
 * So the rule is: in production those fallbacks are a hard failure, not a
 * warning. Better to refuse to boot than to run something that looks fine and
 * is trivially forgeable.
 */

export interface EnvIssue {
  level: "fatal" | "warn"
  key: string
  message: string
}

const DEV_FALLBACKS: Record<string, string> = {
  ADMIN_SESSION_SECRET: "supplysure-admin-dev-secret",
  DRIVER_SESSION_SECRET: "driver-session-dev-secret",
}

export function checkEnvironment(env: NodeJS.ProcessEnv = process.env): EnvIssue[] {
  const issues: EnvIssue[] = []
  const isProduction = env.NODE_ENV === "production"

  // --- Session signing secrets -------------------------------------------
  for (const [key, fallback] of Object.entries(DEV_FALLBACKS)) {
    const value = env[key] || env.NEXTAUTH_SECRET

    if (!value) {
      issues.push({
        level: isProduction ? "fatal" : "warn",
        key,
        message: `Not set, so sessions are signed with the public development secret. Anyone who has seen this repository could forge one. Set ${key} to a random 32+ byte value.`,
      })
      continue
    }

    if (value === fallback) {
      issues.push({
        level: isProduction ? "fatal" : "warn",
        key,
        message: `Set to the known development value. Replace it with a real random secret.`,
      })
      continue
    }

    if (isProduction && value.length < 32) {
      issues.push({
        level: "warn",
        key,
        message: `Only ${value.length} characters. Use at least 32 bytes of randomness.`,
      })
    }
  }

  // --- Auth bypass --------------------------------------------------------
  // Already gated on NODE_ENV in code, but a deployment that sets it has
  // misunderstood something and should hear about it.
  if (env.AUTH_BYPASS === "true" && isProduction) {
    issues.push({
      level: "warn",
      key: "AUTH_BYPASS",
      message: "Set in a production environment. It is ignored in production builds, but remove it to avoid confusion.",
    })
  }

  // --- Database -----------------------------------------------------------
  const databaseUrl = env.DATABASE_URL || ""

  if (!databaseUrl) {
    issues.push({ level: "fatal", key: "DATABASE_URL", message: "Not set." })
  } else if (isProduction && databaseUrl.startsWith("file:")) {
    issues.push({
      level: "warn",
      key: "DATABASE_URL",
      message:
        "Points at SQLite. Fine for a single small instance, but it does not survive a container restart on ephemeral disk and does not support more than one instance. Move to Postgres before scaling out.",
    })
  }

  // --- Scheduler ----------------------------------------------------------
  if (isProduction && !env.CRON_SECRET) {
    issues.push({
      level: "warn",
      key: "CRON_SECRET",
      message: "Not set, so scheduled agents can only be triggered by a signed-in admin. Set it to run them from cron.",
    })
  }

  // --- Model access -------------------------------------------------------
  const hasModelKey = Boolean(
    env.AI_GATEWAY_API_KEY || env.OPENAI_API_KEY || env.ANTHROPIC_API_KEY
  )

  if (!hasModelKey) {
    issues.push({
      level: "warn",
      key: "AI_GATEWAY_API_KEY",
      message: "No model credential found. Every agent feature will fail at call time.",
    })
  }

  return issues
}

/**
 * Called once at startup. Throws on a fatal issue in production so the process
 * dies at boot with a clear message rather than serving forgeable sessions.
 */
export function assertEnvironment(env: NodeJS.ProcessEnv = process.env) {
  // During Next.js build / page analysis phase, secrets are not required to compile.
  if (
    env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build" ||
    process.argv.some((arg) => arg.includes("build"))
  ) {
    return
  }

  const issues = checkEnvironment(env)

  if (!issues.length) {
    return
  }

  const fatal = issues.filter((issue) => issue.level === "fatal")
  const warnings = issues.filter((issue) => issue.level === "warn")

  for (const issue of warnings) {
    console.warn(`[env] ${issue.key}: ${issue.message}`)
  }

  if (fatal.length) {
    const detail = fatal.map((issue) => `  - ${issue.key}: ${issue.message}`).join("\n")
    const error = `Refusing to start.\n\n${detail}\n`

    console.error(`[env] ${error}`)
    throw new Error(error)
  }
}
