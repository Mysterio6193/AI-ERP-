import type { Prisma, PrismaClient } from "@prisma/client"

import { DEFAULT_TAX_RATES } from "@/lib/tax-engine"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Named tax rates.
 *
 * `TaxRate` was modelled with everything a real rate needs — country, rate,
 * type, HSN ranges for India, a default flag — and nothing ever created one or
 * read one. Meanwhile `Product.gstRate` was a bare float, so "which products
 * are GST free" could only be answered by scanning for zeros, and changing a
 * rate meant editing every product carrying that number.
 *
 * The rates themselves already existed as `DEFAULT_TAX_RATES` in the engine.
 * This makes them rows, so they can be referenced, renamed and reported on.
 *
 * `Product.gstRate` stays the fallback. A product with no `taxRateId` prices
 * exactly as it always did.
 */

export interface SeedResult {
  created: number
  existing: number
}

/**
 * Create the standard rates for a company if they are missing.
 *
 * Fills gaps rather than seeding once, for the same reason the chart of
 * accounts does: adding a rate later must reach companies that already exist,
 * or the first thing that references it fails.
 */
export async function ensureDefaultTaxRates(
  db: DbClient,
  companyId: string,
  country?: string | null
): Promise<SeedResult> {
  const key = (country || "AU").toUpperCase() === "IN" ? "IN" : "AU"
  const wanted = DEFAULT_TAX_RATES[key]

  const existing = await db.taxRate.findMany({
    where: { companyId },
    select: { code: true },
  })

  const present = new Set(existing.map((rate) => rate.code))
  const missing = wanted.filter((rate) => !present.has(rate.code))

  if (missing.length > 0) {
    await db.taxRate.createMany({
      data: missing.map((rate) => ({
        name: rate.name,
        code: rate.code,
        country: key,
        rate: rate.rate,
        taxType: rate.taxType,
        // The standard rate for the country is the default; exemptions are not.
        isDefault: rate.taxType === "gst" && rate.rate > 0 && key === "AU",
        status: "active",
        companyId,
      })),
      skipDuplicates: true,
    })
  }

  return { created: missing.length, existing: present.size }
}

/**
 * The rate a product is sold under, when it references one.
 *
 * Returns null when the product carries no reference or the rate has been
 * retired — the caller then falls back to `Product.gstRate`, which is what
 * every product did before this existed.
 */
export async function resolveProductTaxRate(db: DbClient, productId: string) {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      taxRateId: true,
      taxRate: { select: { id: true, name: true, code: true, rate: true, taxType: true, status: true } },
    },
  })

  if (!product?.taxRate || product.taxRate.status !== "active") {
    return null
  }

  return product.taxRate
}

/**
 * Whether a rate can be removed.
 *
 * A rate in use is not deleted, because the products referencing it would fall
 * back to their bare `gstRate` silently — which may be a different number, and
 * nobody would be told.
 */
export async function taxRateUsage(db: DbClient, taxRateId: string) {
  const products = await db.product.count({ where: { taxRateId } })
  return { products, inUse: products > 0 }
}
