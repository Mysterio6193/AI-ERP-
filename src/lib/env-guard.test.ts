import { describe, expect, it } from "vitest"

import { checkEnvironment } from "./env-guard"

/**
 * These checks are the difference between a deployment that refuses to start
 * and one that quietly signs admin sessions with a secret published in the
 * repository. The fatal cases matter most: they must stay fatal.
 */

const prod = (extra: Record<string, string> = {}) =>
  ({
    NODE_ENV: "production",
    DATABASE_URL: "postgres://localhost/app",
    ...extra,
  }) as NodeJS.ProcessEnv

const secret = "a".repeat(40)

const fatalKeys = (env: NodeJS.ProcessEnv) =>
  checkEnvironment(env)
    .filter((issue) => issue.level === "fatal")
    .map((issue) => issue.key)

describe("checkEnvironment in production", () => {
  it("refuses to start when session secrets are unset", () => {
    expect(fatalKeys(prod())).toEqual(
      expect.arrayContaining(["ADMIN_SESSION_SECRET", "DRIVER_SESSION_SECRET"])
    )
  })

  it("refuses the known development secrets", () => {
    const keys = fatalKeys(
      prod({
        ADMIN_SESSION_SECRET: "supplysure-admin-dev-secret",
        DRIVER_SESSION_SECRET: "driver-session-dev-secret",
      })
    )

    expect(keys).toContain("ADMIN_SESSION_SECRET")
    expect(keys).toContain("DRIVER_SESSION_SECRET")
  })

  it("accepts NEXTAUTH_SECRET as a shared fallback", () => {
    expect(fatalKeys(prod({ NEXTAUTH_SECRET: secret }))).toEqual([])
  })

  it("warns but starts on a short secret", () => {
    const issues = checkEnvironment(
      prod({ ADMIN_SESSION_SECRET: "abc", DRIVER_SESSION_SECRET: "def" })
    )

    expect(issues.filter((issue) => issue.level === "fatal")).toEqual([])
    expect(issues.some((issue) => issue.message.includes("characters"))).toBe(true)
  })

  it("is fatal without a database URL", () => {
    const env = { NODE_ENV: "production", NEXTAUTH_SECRET: secret } as NodeJS.ProcessEnv

    expect(fatalKeys(env)).toContain("DATABASE_URL")
  })

  it("warns about SQLite but does not block", () => {
    const issues = checkEnvironment(
      prod({ DATABASE_URL: "file:./db/dev.db", NEXTAUTH_SECRET: secret })
    )

    expect(issues.filter((issue) => issue.level === "fatal")).toEqual([])
    expect(issues.some((issue) => issue.key === "DATABASE_URL")).toBe(true)
  })

  it("passes cleanly when fully configured", () => {
    const issues = checkEnvironment(
      prod({
        ADMIN_SESSION_SECRET: secret,
        DRIVER_SESSION_SECRET: "b".repeat(40),
        CRON_SECRET: "c".repeat(40),
        AI_GATEWAY_API_KEY: "key",
        // A deployment with no mail transport is not fully configured: every
        // invoice and order confirmation is recorded as sent and reaches
        // nobody.
        SMTP_HOST: "smtp.example.com",
      })
    )

    expect(issues).toEqual([])
  })

  it("flags AUTH_BYPASS as a warning, since the build already ignores it", () => {
    const issues = checkEnvironment(
      prod({ NEXTAUTH_SECRET: secret, AUTH_BYPASS: "true" })
    )

    const bypass = issues.find((issue) => issue.key === "AUTH_BYPASS")

    expect(bypass?.level).toBe("warn")
  })
})

describe("checkEnvironment in development", () => {
  it("never blocks local work", () => {
    const issues = checkEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: "file:./db/dev.db",
    } as NodeJS.ProcessEnv)

    expect(issues.filter((issue) => issue.level === "fatal")).toEqual([])
    // Still says something, so the gap is visible before deploying.
    expect(issues.length).toBeGreaterThan(0)
  })
})

describe("production secrets that must not fall back", () => {
  it("is fatal when nothing signs driver sessions, and says so once", () => {
    // getSecret() fell back to a literal published in the source, so a
    // deployment that forgot both secrets minted forgeable driver tokens.
    const issues = checkEnvironment(
      prod({ ADMIN_SESSION_SECRET: secret, AI_GATEWAY_API_KEY: "k", SMTP_HOST: "h" })
    )

    const driver = issues.filter((issue) => issue.key === "DRIVER_SESSION_SECRET")
    expect(driver).toHaveLength(1)
    expect(driver[0].level).toBe("fatal")
  })

  it("accepts NEXTAUTH_SECRET as the driver signing key", () => {
    const issues = checkEnvironment(
      prod({
        ADMIN_SESSION_SECRET: secret,
        NEXTAUTH_SECRET: secret,
        AI_GATEWAY_API_KEY: "k",
        SMTP_HOST: "h",
      })
    )

    expect(issues.some((issue) => issue.key === "DRIVER_SESSION_SECRET")).toBe(false)
  })

  it("is fatal when sign-up codes are returned to the caller", () => {
    // Anyone could verify any email address without ever receiving the code.
    const issues = checkEnvironment(
      prod({
        ADMIN_SESSION_SECRET: secret,
        NEXTAUTH_SECRET: secret,
        AI_GATEWAY_API_KEY: "k",
        SMTP_HOST: "h",
        CUSTOMER_OTP_EXPOSE: "true",
      })
    )

    expect(issues.find((issue) => issue.key === "CUSTOMER_OTP_EXPOSE")?.level).toBe("fatal")
  })

  it("warns when a configured integration cannot verify its webhook", () => {
    const issues = checkEnvironment(
      prod({
        ADMIN_SESSION_SECRET: secret,
        NEXTAUTH_SECRET: secret,
        AI_GATEWAY_API_KEY: "k",
        SMTP_HOST: "h",
        STRIPE_SECRET_KEY: "sk_live_x",
        TELEGRAM_BOT_TOKEN: "bot",
      })
    )

    // Both refuse unverified traffic, so a missing secret is a dead
    // integration rather than an open door — a warning, not a fatal.
    expect(issues.find((issue) => issue.key === "STRIPE_WEBHOOK_SECRET")?.level).toBe("warn")
    expect(issues.find((issue) => issue.key === "TELEGRAM_WEBHOOK_SECRET")?.level).toBe("warn")
  })

  it("stays quiet about webhook secrets for integrations that are not configured", () => {
    const issues = checkEnvironment(
      prod({
        ADMIN_SESSION_SECRET: secret,
        NEXTAUTH_SECRET: secret,
        AI_GATEWAY_API_KEY: "k",
        SMTP_HOST: "h",
      })
    )

    expect(issues.some((issue) => issue.key === "STRIPE_WEBHOOK_SECRET")).toBe(false)
  })
})

describe("production deployment blockers", () => {
  it("refuses a localhost database in production", () => {
    // The embedded development Postgres. In production that address points at
    // nothing, and the app boots anyway.
    const issues = checkEnvironment(
      prod({ DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/supplysure" })
    )
    const db = issues.find((issue) => issue.key === "DATABASE_URL")

    expect(db?.level).toBe("fatal")
  })

  it("accepts a real database host", () => {
    const issues = checkEnvironment(
      prod({ DATABASE_URL: "postgresql://user:pw@db.internal.example.com:5432/supplysure" })
    )

    expect(issues.find((issue) => issue.key === "DATABASE_URL")).toBeUndefined()
  })

  it("warns when agents run on a free model tier in production", () => {
    const issues = checkEnvironment(prod({ AGENT_MODEL: "minimax/minimax-m3:free" }))
    const model = issues.find((issue) => issue.key === "AGENT_MODEL")

    expect(model?.level).toBe("warn")
    expect(model?.message).toContain("minimax/minimax-m3:free")
  })

  it("says nothing about a paid model", () => {
    const issues = checkEnvironment(prod({ AGENT_MODEL: "anthropic/claude-sonnet-5" }))
    expect(issues.find((issue) => issue.key === "AGENT_MODEL")).toBeUndefined()
  })

  it("leaves development alone on both counts", () => {
    const issues = checkEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/supplysure",
      AGENT_MODEL: "minimax/minimax-m3:free",
    } as NodeJS.ProcessEnv)

    expect(issues.find((issue) => issue.key === "DATABASE_URL")).toBeUndefined()
    expect(issues.find((issue) => issue.key === "AGENT_MODEL")).toBeUndefined()
  })
})
