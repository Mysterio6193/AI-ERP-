/**
 * A backup of the business, using only what this machine has.
 *
 * The database is Postgres 18 run by `embedded-postgres` out of node_modules,
 * with its data directory at `.pgdata` inside the working tree. That setup
 * ships three binaries — initdb, pg_ctl, postgres — and none of the ones a
 * backup normally uses. There is no pg_dump here, no pg_basebackup, no psql,
 * so the standard answer is not available.
 *
 * What is available is Prisma, which knows every model. So the export is
 * logical and application-level: every table read out to JSON, gzipped, with a
 * manifest recording what was taken. That is slower than pg_dump and would be
 * the wrong choice at a hundred gigabytes; at 18MB it takes seconds, and it
 * carries two advantages that matter more here — it survives a Postgres
 * version change, and it can be read and checked by anything.
 *
 * The rehearsal lives in verify-backup.ts. An export nobody has restored is a
 * hope, not a backup, so that script restores this file into a scratch database
 * and compares it row for row.
 */
import { createWriteStream } from "node:fs"
import { mkdir, readdir, stat, unlink } from "node:fs/promises"
import path from "node:path"
import { createGzip } from "node:zlib"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"

import { db } from "@/lib/db"
import { clientKeyFor, modelNames, schemaChecksum, type BackupManifest } from "@/lib/backup-manifest"

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups")

/** Keep this many, delete older. A backup disk that fills stops backing up. */
const KEEP = Number(process.env.BACKUP_KEEP || 14)

/** Read in pages, so a large table cannot exhaust memory. */
const PAGE = 1000

async function* rowsOf(model: string): AsyncGenerator<string> {
  const client = (db as never as Record<string, { findMany: (args: unknown) => Promise<unknown[]> }>)[
    clientKeyFor(model)
  ]

  if (!client?.findMany) return

  let skip = 0

  for (;;) {
    const page = await client.findMany({ take: PAGE, skip, orderBy: { id: "asc" } }).catch(() =>
      // Not every model has an `id` to order by; fall back to no ordering.
      client.findMany({ take: PAGE, skip })
    )

    if (page.length === 0) return

    for (const row of page) {
      yield JSON.stringify({ __model: model, ...(row as object) })
    }

    if (page.length < PAGE) return
    skip += PAGE
  }
}

/** Rotate: keep the newest KEEP files, remove the rest. */
async function rotate(): Promise<string[]> {
  const entries = await readdir(BACKUP_DIR).catch(() => [] as string[])
  const backups = entries.filter((name) => name.startsWith("supplysure-") && name.endsWith(".ndjson.gz")).sort()
  const doomed = backups.slice(0, Math.max(0, backups.length - KEEP))

  for (const name of doomed) {
    await unlink(path.join(BACKUP_DIR, name)).catch(() => undefined)
  }

  return doomed
}

export async function runBackup(): Promise<{ file: string; manifest: BackupManifest }> {
  await mkdir(BACKUP_DIR, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, "-")
  const file = path.join(BACKUP_DIR, `supplysure-${stamp}.ndjson.gz`)

  const version: any = await db.$queryRawUnsafe(
    "select current_setting('server_version') as v, current_database() as d"
  )

  const counts: Record<string, number> = {}
  const models = modelNames()

  /**
   * Written as newline-delimited JSON rather than one big array, so a restore
   * can stream it and a truncated file still yields every complete row before
   * the cut rather than failing to parse at all.
   */
  async function* lines() {
    // The manifest goes last, once the counts are known, so its presence at the
    // end of the file is itself the proof the backup finished.
    for (const model of models) {
      let n = 0

      for await (const line of rowsOf(model)) {
        n += 1
        yield `${line}\n`
      }

      counts[model] = n
      if (n > 0) process.stderr.write(`  ${model}: ${n}\n`)
    }

    const manifest: BackupManifest = {
      takenAt: new Date().toISOString(),
      database: version[0].d,
      postgresVersion: version[0].v,
      counts,
      totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
      schemaChecksum: schemaChecksum(),
    }

    yield `${JSON.stringify({ __manifest: manifest })}\n`
  }

  await pipeline(Readable.from(lines()), createGzip({ level: 6 }), createWriteStream(file))

  const manifest: BackupManifest = {
    takenAt: new Date().toISOString(),
    database: version[0].d,
    postgresVersion: version[0].v,
    counts,
    totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
    schemaChecksum: schemaChecksum(),
  }

  return { file, manifest }
}

async function main() {
  console.log("Backing up SupplySure\n")

  const { file, manifest } = await runBackup()
  const { size } = await stat(file)
  const removed = await rotate()

  console.log(`\n  ${manifest.totalRows} rows across ${Object.keys(manifest.counts).length} tables`)
  console.log(`  ${(size / 1024 / 1024).toFixed(2)} MB -> ${path.relative(process.cwd(), file)}`)
  console.log(`  schema ${manifest.schemaChecksum}, postgres ${manifest.postgresVersion}`)
  if (removed.length) console.log(`  rotated out ${removed.length} older backup(s)`)

  console.log("\nNot yet proven restorable. Run: npx tsx scripts/verify-backup.ts")
  await db.$disconnect()
}

/**
 * Only when this file is the one that was run.
 *
 * `includes("backup")` also matched verify-backup.ts, which imports this
 * module — so asking to verify silently took a fresh backup first and then
 * "verified" the file it had just written. A rehearsal against a file made
 * seconds ago is not a rehearsal; the whole value is in checking one that has
 * been sitting on disk.
 */
if (path.basename(process.argv[1] ?? "") === "backup.ts") main()
