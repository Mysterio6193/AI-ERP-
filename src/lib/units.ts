import { db } from "@/lib/db"

/**
 * Packing levels and conversion.
 *
 * The same product is sold by the box to a restaurant and by the pallet to a
 * distributor. Stock is always counted in the base unit; this converts at the
 * edges — order entry, pricing, picking, freight — so nothing downstream has to
 * know how a customer likes to order.
 *
 * Two rules that matter in practice:
 *
 *   - Prices are per selling unit, and a pallet price is not always the box
 *     price times sixty. A unit may carry its own price; otherwise it derives.
 *   - Conversions round to whole base units. You cannot pick two thirds of a
 *     carton, and silently shipping 40 when someone ordered 40.5 is worse than
 *     saying so.
 */

export interface ResolvedUnit {
  id: string
  code: string
  name: string
  factor: number
  isBase: boolean
  price: number
  /** True when the price came from the unit rather than being derived. */
  explicitPrice: boolean
  weightKg: number | null
}

/** The synthetic unit used when a product has no packing levels defined yet. */
function fallbackUnit(product: {
  id: string
  baseUnit: string
  wholesalePrice: number
  weight: number | null
}): ResolvedUnit {
  return {
    id: `${product.id}:base`,
    code: (product.baseUnit || "each").toUpperCase(),
    name: product.baseUnit || "each",
    factor: 1,
    isBase: true,
    price: product.wholesalePrice,
    explicitPrice: false,
    weightKg: product.weight,
  }
}

export async function unitsForProduct(productId: string): Promise<ResolvedUnit[]> {
  const product = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      baseUnit: true,
      wholesalePrice: true,
      weight: true,
      units: { where: { status: "active" }, orderBy: { factor: "asc" } },
    },
  })

  if (!product) {
    return []
  }

  if (!product.units.length) {
    // Every product still works before anyone defines packing levels.
    return [fallbackUnit(product)]
  }

  return product.units.map((unit) => ({
    id: unit.id,
    code: unit.code,
    name: unit.name,
    factor: unit.factor,
    isBase: unit.isBase,
    price: unit.price ?? Number((product.wholesalePrice * unit.factor).toFixed(2)),
    explicitPrice: unit.price !== null,
    weightKg: unit.weightKg,
  }))
}

export interface Conversion {
  ok: boolean
  error?: string
  /** Whole base units. */
  baseQuantity: number
  unit: ResolvedUnit
  unitPrice: number
  lineTotal: number
  /** Set when the requested amount does not divide into whole base units. */
  rounded?: { requested: number; actual: number }
}

/**
 * Turns "2 pallets" into base units and a price.
 *
 * `unitCode` is matched case-insensitively against the product's own levels, so
 * an agent saying "pallet" works without knowing ids.
 */
export async function convertToBase(input: {
  productId: string
  quantity: number
  unitCode?: string | null
}): Promise<Conversion | { ok: false; error: string }> {
  const units = await unitsForProduct(input.productId)

  if (!units.length) {
    return { ok: false as const, error: "Product not found" }
  }

  const wanted = (input.unitCode || "").trim().toUpperCase()

  const unit = wanted
    ? units.find((candidate) => candidate.code === wanted || candidate.name.toUpperCase() === wanted)
    : units.find((candidate) => candidate.isBase) || units[0]

  if (!unit) {
    return {
      ok: false as const,
      error: `"${input.unitCode}" is not a unit for this product. Available: ${units
        .map((candidate) => candidate.code)
        .join(", ")}`,
    }
  }

  const exact = input.quantity * unit.factor
  const baseQuantity = Math.round(exact)

  const conversion: Conversion = {
    ok: true,
    baseQuantity,
    unit,
    unitPrice: unit.price,
    lineTotal: Number((input.quantity * unit.price).toFixed(2)),
  }

  if (Math.abs(exact - baseQuantity) > 0.001) {
    conversion.rounded = { requested: exact, actual: baseQuantity }
  }

  return conversion
}

/** Renders a base quantity in the largest whole packing level, then the remainder. */
export async function describeQuantity(productId: string, baseQuantity: number) {
  const units = await unitsForProduct(productId)
  const descending = [...units].sort((a, b) => b.factor - a.factor)

  const largest = descending.find((unit) => unit.factor > 1 && baseQuantity >= unit.factor)

  if (!largest) {
    const base = units.find((unit) => unit.isBase) || units[0]
    return `${baseQuantity} ${base.name}`
  }

  const whole = Math.floor(baseQuantity / largest.factor)
  const remainder = baseQuantity - whole * largest.factor
  const base = units.find((unit) => unit.isBase) || units[0]

  return remainder > 0
    ? `${whole} ${largest.name} + ${remainder} ${base.name}`
    : `${whole} ${largest.name}`
}

/**
 * Defines the packing levels for a product.
 *
 * Replaces the set wholesale, because a half-edited hierarchy (two bases, or a
 * pallet smaller than a box) is worse than none.
 */
export async function setProductUnits(
  productId: string,
  units: Array<{
    code: string
    name: string
    factor: number
    isBase?: boolean
    isDefaultSell?: boolean
    isDefaultBuy?: boolean
    price?: number | null
    weightKg?: number | null
    perLayer?: number | null
    layers?: number | null
  }>
) {
  if (!units.length) {
    return { ok: false as const, error: "At least one unit is required" }
  }

  const bases = units.filter((unit) => unit.isBase)

  if (bases.length !== 1) {
    return {
      ok: false as const,
      error: `Exactly one unit must be the base. Got ${bases.length}.`,
    }
  }

  if (bases[0].factor !== 1) {
    return { ok: false as const, error: "The base unit must have a factor of 1" }
  }

  const codes = new Set(units.map((unit) => unit.code.toUpperCase()))
  if (codes.size !== units.length) {
    return { ok: false as const, error: "Unit codes must be unique for a product" }
  }

  if (units.some((unit) => unit.factor <= 0)) {
    return { ok: false as const, error: "Factors must be greater than zero" }
  }

  await db.$transaction(async (tx) => {
    await tx.productUnit.deleteMany({ where: { productId } })

    await tx.productUnit.createMany({
      data: units.map((unit) => ({
        productId,
        code: unit.code.toUpperCase(),
        name: unit.name,
        factor: unit.factor,
        isBase: Boolean(unit.isBase),
        isDefaultSell: Boolean(unit.isDefaultSell),
        isDefaultBuy: Boolean(unit.isDefaultBuy),
        price: unit.price ?? null,
        weightKg: unit.weightKg ?? null,
        perLayer: unit.perLayer ?? null,
        layers: unit.layers ?? null,
      })),
    })
  })

  return { ok: true as const, units: await unitsForProduct(productId) }
}

/**
 * Pallet and weight totals for an order, for the freight booking.
 *
 * Uses each line's own packing level, so a mixed order of pallets and loose
 * cartons is measured the way it will actually be loaded.
 */
export async function orderFreightProfile(orderId: string) {
  const items = await db.salesOrderItem.findMany({
    where: { orderId },
    select: {
      quantity: true,
      unitQuantity: true,
      product: { select: { id: true, name: true, weight: true } },
      unit: { select: { code: true, name: true, factor: true, weightKg: true } },
    },
  })

  let totalWeightKg = 0
  let pallets = 0
  let loose = 0

  for (const item of items) {
    if (item.unit && item.unitQuantity) {
      const each = item.unit.weightKg ?? (item.product.weight || 0) * item.unit.factor
      totalWeightKg += each * item.unitQuantity

      if (item.unit.code === "PALLET") {
        pallets += item.unitQuantity
      } else {
        loose += item.unitQuantity
      }
    } else {
      totalWeightKg += (item.product.weight || 0) * item.quantity
      loose += item.quantity
    }
  }

  return {
    totalWeightKg: Number(totalWeightKg.toFixed(2)),
    pallets,
    looseUnits: loose,
    lines: items.length,
  }
}
