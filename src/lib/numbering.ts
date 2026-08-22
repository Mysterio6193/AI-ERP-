import type { Prisma, PrismaClient } from "@prisma/client"

import type { SettingsOf } from "@/lib/settings/registry"
import { getSettings } from "@/lib/settings/service"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Document numbers.
 *
 * Sixteen generators in four styles produced these, and several were already
 * broken. `count + 1` — used by returns, routes, deliveries, pick lists and
 * freight bookings — collides the moment a row is deleted, because the count
 * goes down while the highest issued number does not. The parse-the-last-one
 * style loses updates under concurrency: two requests read the same previous
 * number and both add one.
 *
 * A counter row fixes both, but switching format and switching mechanism at
 * once cannot be verified. So every kind starts with `useCounter: false` and
 * delegates to its preserved legacy generator, bit for bit. Flip one kind at a
 * time, after its counter has been seeded.
 */

export type DocumentKind = keyof SettingsOf<"numbering">

type Format = SettingsOf<"numbering">[DocumentKind]

function two(value: number) {
  return String(value).padStart(2, "0")
}

/** The date segment of the number, empty when the format has none. */
export function renderDateToken(token: Format["dateToken"], date: Date) {
  const year = date.getFullYear()

  switch (token) {
    case "none":
      return ""
    case "YY":
      return String(year).slice(-2)
    case "YYYY":
      return String(year)
    case "YYYYMM":
      return `${year}${two(date.getMonth() + 1)}`
    case "YYYYMMDD":
      return `${year}${two(date.getMonth() + 1)}${two(date.getDate())}`
  }
}

/**
 * The key identifying the counter's reset period.
 *
 * Distinct from the date token: freight bookings print the year but never
 * reset, so their token is "YYYY" while their period is "".
 */
export function periodKey(reset: Format["reset"], date: Date) {
  switch (reset) {
    case "never":
      return ""
    case "yearly":
      return String(date.getFullYear())
    case "monthly":
      return `${date.getFullYear()}${two(date.getMonth() + 1)}`
    case "daily":
      return `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`
  }
}

/** Assemble a number from a format and a sequence value. Pure. */
export function renderDocumentNumber(format: Format, sequence: number, date: Date) {
  const dateToken = renderDateToken(format.dateToken, date)
  const padded = String(sequence).padStart(format.pad, "0")

  const parts = dateToken ? [format.prefix, dateToken, padded] : [format.prefix, padded]

  return `${parts.join(format.separator)}${format.suffix}`
}

/**
 * Highest sequence already issued for this kind and period, so a counter
 * created today continues the existing series instead of restarting at 1 and
 * colliding with every number ever issued.
 */
async function seedFrom(
  db: DbClient,
  kind: DocumentKind,
  format: Format,
  date: Date
): Promise<number> {
  const prefix = renderDateToken(format.dateToken, date)
    ? `${format.prefix}${format.separator}${renderDateToken(format.dateToken, date)}${format.separator}`
    : `${format.prefix}${format.separator}`

  const lookup: Record<DocumentKind, { table: string; column: string }> = {
    salesOrder: { table: "SalesOrder", column: "orderNumber" },
    quote: { table: "Quote", column: "quoteNumber" },
    invoice: { table: "Invoice", column: "invoiceNumber" },
    purchaseOrder: { table: "PurchaseOrder", column: "poNumber" },
    pickList: { table: "PickList", column: "pickNumber" },
    delivery: { table: "Delivery", column: "deliveryNumber" },
    route: { table: "DeliveryRoute", column: "routeNumber" },
    productionOrder: { table: "ProductionOrder", column: "orderNumber" },
    freightBooking: { table: "FreightBooking", column: "bookingNumber" },
    creditNote: { table: "CreditNote", column: "cnNumber" },
    return: { table: "Return", column: "returnNumber" },
    case: { table: "Case", column: "caseNumber" },
  }

  const { table, column } = lookup[kind]

  // Raw because the column differs per table. Identifiers come from the map
  // above, never from caller input, and the prefix is a bound parameter.
  const rows = await (db as PrismaClient).$queryRawUnsafe<Array<{ max: string | null }>>(
    `SELECT MAX(SUBSTRING("${column}" FROM '[0-9]+$')::int)::text AS max
       FROM "${table}"
      WHERE "${column}" LIKE $1`,
    `${prefix}%`
  )

  const highest = Number(rows?.[0]?.max ?? 0)

  return Math.max(Number.isFinite(highest) ? highest : 0, format.start - 1)
}

export interface NextNumberOptions {
  db: DbClient
  companyId?: string | null
  date?: Date
  /**
   * The preserved legacy generator. Called verbatim while `useCounter` is
   * false, which is how this lands without changing a single number.
   */
  legacy: () => Promise<string>
}

export async function nextDocumentNumber(
  kind: DocumentKind,
  { db, companyId, date = new Date(), legacy }: NextNumberOptions
): Promise<string> {
  const numbering = await getSettings("numbering", { companyId })
  const format = numbering[kind]

  if (!format.useCounter) {
    return legacy()
  }

  const period = periodKey(format.reset, date)
  const companyKey = companyId ?? ""

  const existing = await db.documentCounter.findUnique({
    where: { kind_period_companyKey: { kind, period, companyKey } },
    select: { id: true },
  })

  // Prisma evaluates `create` eagerly, so the seed scan has to be skipped
  // explicitly once the counter exists — otherwise every document number
  // would pay for a MAX() over the whole table. The value is ignored by the
  // update branch.
  const seed = existing ? 0 : (await seedFrom(db, kind, format, date)) + 1

  // `upsert` compiles to INSERT ... ON CONFLICT DO UPDATE, so the increment is
  // atomic: concurrent callers cannot be handed the same number.
  const counter = await db.documentCounter.upsert({
    where: { kind_period_companyKey: { kind, period, companyKey } },
    create: { kind, period, companyKey, value: seed },
    update: { value: { increment: 1 } },
    select: { value: true },
  })

  return renderDocumentNumber(format, counter.value, date)
}
