/**
 * Manages the project-scoped Postgres cluster used for local development.
 *
 * Binaries come from the embedded-postgres devDependency (official PostgreSQL
 * builds for this platform); the data directory lives at .pgdata/ inside the
 * repo and is gitignored. Nothing outside the project is touched — the Mac
 * mini deployment can swap to a native install by changing DATABASE_URL only.
 *
 *   node scripts/pg.mjs start    # initdb on first run, then serve on :5432
 *   node scripts/pg.mjs stop
 *   node scripts/pg.mjs status
 */
import { existsSync, mkdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
import path from "node:path"

const ROOT = process.cwd()
const PGDATA = path.join(ROOT, ".pgdata")
const PORT = Number(process.env.PGPORT || 5432)
const USER = "postgres"
const DB_NAME = "supplysure"
const NATIVE_BIN = path.join(ROOT, "node_modules", "@embedded-postgres", "darwin-arm64", "native", "bin")

function pgctl(action) {
  return execFileSync(path.join(NATIVE_BIN, "pg_ctl"), ["-D", PGDATA, ...action], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

async function main() {
  const cmd = process.argv[2]

  if (cmd === "status") {
    try {
      console.log(pgctl(["status"]))
    } catch {
      console.log("stopped")
      process.exit(3)
    }
    return
  }

  if (cmd === "stop") {
    try {
      console.log(pgctl(["stop", "-m", "fast"]))
    } catch (error) {
      console.error("Not running (or stop failed):", error.message)
      process.exit(1)
    }
    return
  }

  if (cmd !== "start") {
    console.log("Usage: node scripts/pg.mjs <start|stop|status>")
    process.exit(2)
  }

  const { default: EmbeddedPostgres } = await import("embedded-postgres")

  if (!existsSync(PGDATA)) {
    mkdirSync(PGDATA, { recursive: true })
  }

  const freshCluster = !existsSync(path.join(PGDATA, "PG_VERSION"))
  if (freshCluster) {
    const { default: EmbeddedPostgres } = await import("embedded-postgres")
    const pg = new EmbeddedPostgres({
      databaseDir: PGDATA,
      user: USER,
      password: "postgres",
      port: PORT,
      onError: (messageOrError) => console.error("[postgres]", messageOrError),
    })
    console.log(`Initialising new cluster at ${PGDATA} …`)
    await pg.initialise()
  }

  // Use pg_ctl so the server outlives this process (embedded-postgres would
  // tie its lifetime to this Node process even with persistent:true).
  try {
    pgctl(["status"])
    console.log("Postgres already running.")
  } catch {
    execFileSync(path.join(NATIVE_BIN, "pg_ctl"), ["-D", PGDATA, "-l", path.join(PGDATA, "postgres.log"), "start"], {
      encoding: "utf8",
    })
    console.log("Postgres started.")
    // Wait until accepting connections.
    let up = false
    for (let i = 0; i < 30 && !up; i++) {
      try {
        pgctl(["status"])
        up = true
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    if (!up) {
      console.error("Postgres did not come up. Check .pgdata/postgres.log")
      process.exit(1)
    }
  }

  // Ensure the application database exists.
  {
    const { Client } = await import("pg")
    const client = new Client({ host: "localhost", port: PORT, user: USER, password: "postgres", database: "postgres" })
    await client.connect()
    const { rows } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [DB_NAME])
    if (!rows.length) {
      await client.query(`CREATE DATABASE "${DB_NAME}"`)
      console.log(`Created database "${DB_NAME}".`)
    } else {
      console.log(`Database "${DB_NAME}" already exists.`)
    }
    await client.end()
  }

  console.log(`Postgres ready on port ${PORT}.`)
  console.log(`DATABASE_URL="postgresql://${USER}:postgres@localhost:${PORT}/${DB_NAME}?schema=public"`)
}

main()
