import { Prisma } from "@prisma/client"

/**
 * The parts of a backup that are worth testing without taking one.
 *
 * Kept out of `scripts/backup.ts` because the vitest harness only looks at
 * `src/`, and because these are the pieces where being quietly wrong is most
 * expensive: a model whose client key does not resolve is skipped in silence
 * and simply never appears in a backup, which nobody discovers until a restore.
 */

export interface BackupManifest {
  takenAt: string
  database: string
  postgresVersion: string
  /** Row count per model — what a restore is checked against. */
  counts: Record<string, number>
  totalRows: number
  schemaChecksum: string
}

/** Every model Prisma knows, in a stable order so two backups agree. */
export function modelNames(): string[] {
  return Prisma.dmmf.datamodel.models.map((model) => model.name).sort()
}

/** The Prisma client property for a model — `SalesOrder` is `db.salesOrder`. */
export function clientKeyFor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

/**
 * A fingerprint of the schema at the moment of the backup.
 *
 * Restoring into a schema that has since changed shape is the failure worth
 * catching: it does not error, it silently drops whatever no longer has a
 * column. Comparing this on restore turns that into a warning.
 */
export function schemaChecksum(): string {
  const shape = Prisma.dmmf.datamodel.models
    .map((model) => `${model.name}:${model.fields.map((f) => f.name).sort().join(",")}`)
    .sort()
    .join("|")

  let hash = 0
  for (let i = 0; i < shape.length; i++) {
    hash = (hash * 31 + shape.charCodeAt(i)) | 0
  }

  return (hash >>> 0).toString(16)
}
