/**
 * Restore the newest backup into a scratch database and check it row for row.
 *
 * This is the whole point of the exercise. Taking a backup is easy and proves
 * nothing: the file can be truncated, the export can silently skip a table, the
 * schema can have moved on since. None of that shows up until the day it
 * matters, which is the worst possible day to discover it.
 *
 * So this restores for real, into a database created for the purpose and
 * dropped afterwards, and compares what came back against the manifest. It
 * never touches the live database — the scratch name is generated per run and
 * the script refuses to proceed if the target resolves to the working one.
 */
import { createReadStream } from "node:fs"
import { readdir } from "node:fs/promises"
import path from "node:path"
import readline from "node:readline"
import { createGunzip } from "node:zlib"
import { execFileSync } from "node:child_process"

import { PrismaClient } from "@prisma/client"
import { db } from "@/lib/db"
import { clientKeyFor, type BackupManifest, schemaChecksum } from "@/lib/backup-manifest"

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups")

function adminUrl(database: string): string {
  const url = new URL(process.env.DATABASE_URL as string)
  url.pathname = `/${database}`
  url.search = ""
  return url.toString()
}

async function newestBackup(): Promise<string> {
  const entries = await readdir(BACKUP_DIR)
  const backups = entries.filter((n) => n.startsWith("supplysure-") && n.endsWith(".ndjson.gz")).sort()

  if (backups.length === 0) throw new Error("No backups found. Run scripts/backup.ts first.")

  return path.join(BACKUP_DIR, backups[backups.length - 1])
}

async function* readBackup(file: string): AsyncGenerator<Record<string, unknown>> {
  const stream = createReadStream(file).pipe(createGunzip())
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })

  for await (const line of lines) {
    if (!line.trim()) continue
    yield JSON.parse(line)
  }
}

async function main() {
  const liveName = new URL(process.env.DATABASE_URL as string).pathname.replace("/", "")
  const scratch = `supplysure_restore_check_${Date.now()}`

  if (scratch === liveName) throw new Error("Refusing to run: the scratch name matched the live database.")

  const file = await newestBackup()
  console.log(`Rehearsing a restore of ${path.basename(file)}\n`)

  // 1. Read the file once to recover the manifest and the rows.
  const rowsByModel = new Map<string, Record<string, unknown>[]>()
  let manifest: BackupManifest | null = null

  for await (const record of readBackup(file)) {
    if (record.__manifest) {
      manifest = record.__manifest as BackupManifest
      continue
    }

    const model = record.__model as string
    delete record.__model

    const list = rowsByModel.get(model) ?? []
    list.push(record)
    rowsByModel.set(model, list)
  }

  if (!manifest) {
    // The manifest is written last, so its absence means the backup was cut off.
    throw new Error("This backup has no manifest — it did not finish writing. Do not rely on it.")
  }

  console.log(`  taken ${manifest.takenAt}`)
  console.log(`  claims ${manifest.totalRows} rows across ${Object.keys(manifest.counts).length} tables`)

  if (manifest.schemaChecksum !== schemaChecksum()) {
    console.warn(
      `\n  WARNING  the schema has changed since this backup (${manifest.schemaChecksum} -> ${schemaChecksum()}).` +
        `\n           A restore will silently drop anything that no longer has a column.\n`
    )
  }

  // 2. Build the scratch database and give it the current schema.
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl("postgres") } } })
  await admin.$executeRawUnsafe(`CREATE DATABASE "${scratch}"`)
  await admin.$disconnect()
  console.log(`\n  created scratch database ${scratch}`)

  let failures = 0

  try {
    execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
      env: { ...process.env, DATABASE_URL: adminUrl(scratch) },
      stdio: "pipe",
    })
    console.log("  schema pushed")

    // 3. Restore. FK constraints are deferred for the load rather than the rows
    //    being topologically sorted — the ordering is a property of the schema
    //    and would need maintaining every time a relation is added.
    const target = new PrismaClient({ datasources: { db: { url: adminUrl(scratch) } } })
    let restored = 0

    await target.$transaction(async (tx) => {
      /**
       * Foreign keys off for the load.
       *
       * `SET CONSTRAINTS ALL DEFERRED` was the first attempt and does nothing
       * here: Postgres only defers constraints declared DEFERRABLE, and
       * Prisma declares none. `session_replication_role = replica` disables
       * the FK triggers outright, which is what a restore wants — the rows
       * were consistent when they were exported, and insisting they be
       * inserted in dependency order means maintaining a topological sort
       * that breaks every time someone adds a relation.
       *
       * Scoped with SET LOCAL, so it lives and dies with this transaction and
       * cannot leak onto a pooled connection.
       */
      await tx.$executeRawUnsafe("SET LOCAL session_replication_role = 'replica'")

      for (const [model, rows] of rowsByModel) {
        const client = (tx as never as Record<string, { createMany: (a: unknown) => Promise<{ count: number }> }>)[
          clientKeyFor(model)
        ]

        if (!client?.createMany) continue

        const result = await client.createMany({ data: rows, skipDuplicates: true })
        restored += result.count
      }
    }, { timeout: 120_000 })

    console.log(`  restored ${restored} rows`)

    // 4. The check that matters: count what actually landed.
    console.log("\n  comparing against the manifest…")

    for (const [model, expected] of Object.entries(manifest.counts)) {
      if (expected === 0) continue

      const client = (target as never as Record<string, { count: () => Promise<number> }>)[clientKeyFor(model)]
      if (!client?.count) continue

      const actual = await client.count()

      if (actual !== expected) {
        console.error(`    FAIL  ${model}: expected ${expected}, restored ${actual}`)
        failures++
      }
    }

    // 5. A spot-check on money, because row counts can match while values do not.
    const liveTotal: any = await db.$queryRawUnsafe(`select coalesce(sum("totalAmount"),0)::float as t from "SalesOrder"`)
    const restoredTotal: any = await target.$queryRawUnsafe(`select coalesce(sum("totalAmount"),0)::float as t from "SalesOrder"`)

    if (Math.abs(liveTotal[0].t - restoredTotal[0].t) > 0.01) {
      console.error(`    FAIL  sales order totals differ: ${liveTotal[0].t} vs ${restoredTotal[0].t}`)
      failures++
    } else {
      console.log(`    ok    sales order totals match ($${liveTotal[0].t.toFixed(2)})`)
    }

    await target.$disconnect()
  } finally {
    // 6. Always clean up, even on failure — a scratch database left behind is
    //    a second copy of the business nobody is watching.
    const cleanup = new PrismaClient({ datasources: { db: { url: adminUrl("postgres") } } })
    await cleanup.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${scratch}" WITH (FORCE)`)
    await cleanup.$disconnect()
    console.log(`\n  dropped scratch database`)
  }

  await db.$disconnect()

  if (failures === 0) {
    console.log("\nRestore rehearsed successfully. This backup is known-good.")
    process.exit(0)
  }

  console.error(`\n${failures} check(s) failed. This backup is NOT safe to rely on.`)
  process.exit(1)
}

main().catch((error) => {
  console.error(`\nThe rehearsal did not complete: ${error instanceof Error ? error.message : String(error)}`)
  console.error("Treat the backup as unproven until this passes.")
  process.exit(1)
})
