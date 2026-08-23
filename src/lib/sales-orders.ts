import { sendSalesOrderEmail } from "@/lib/communications"
import { checkCreditForOrder } from "@/lib/credit"
import { db } from "@/lib/db"
import { ensurePickListForOrder, resolveDefaultWarehouseId } from "@/lib/pick-lists"
import { applyOrderDiscounts, resolveLinePrice } from "@/lib/pricing"
import { getSettings } from "@/lib/settings/service"
import { computeLineTax } from "@/lib/tax"
import { nextDocumentNumber } from "@/lib/numbering"

/**
 * Shared sales order creation.
 *
 * Extracted from the POST /api/orders handler so every entry point - the admin
 * UI, the commerce storefront, and the agent layer (Telegram / WhatsApp) -
 * creates orders through one implementation with identical pricing, tax and
 * credit-limit behaviour. `sourceChannel` records where the order came from.
 */

export interface SalesOrderInputItem {
  productId: string
  quantity: number
  unitPrice?: number
  discount?: number
}

export interface CreateSalesOrderInput {
  customerId: string
  items: SalesOrderInputItem[]
  locationId?: string | null
  warehouseId?: string | null
  deliveryDate?: string | Date | null
  notes?: string | null
  sourceChannel?: string
  status?: string
  createdByAgent?: boolean
}

export type CreateSalesOrderResult =
  | { ok: true; order: Awaited<ReturnType<typeof createOrderRecord>> }
  | { ok: false; error: string; code: "customer_not_found" | "product_not_found" | "credit_limit" | "no_items" }

export async function generateSalesOrderNumber() {
  const currentYear = new Date().getFullYear()
  const orderPrefix = `SO-${currentYear}-`

  const lastOrder = await db.salesOrder.findFirst({
    where: { orderNumber: { startsWith: orderPrefix } },
    orderBy: { createdAt: "desc" },
    select: { orderNumber: true },
  })

  let orderNum = 1001
  if (lastOrder) {
    const parts = lastOrder.orderNumber.split("-")
    if (parts.length >= 3) {
      orderNum = parseInt(parts[2]) + 1
    }
  }

  return `${orderPrefix}${orderNum.toString().padStart(5, "0")}`
}

function createOrderRecord(data: Parameters<typeof db.salesOrder.create>[0]["data"]) {
  return db.salesOrder.create({
    data,
    include: {
      customer: true,
      items: { include: { product: true } },
    },
  })
}

/** Prices a basket without writing anything - used for agent quotes and confirmations. */
export interface PricingContext {
  customerId?: string | null
  companyId?: string | null
}

export async function priceSalesOrder(
  items: SalesOrderInputItem[],
  context: PricingContext = {}
) {
  let subtotal = 0
  let totalTax = 0

  // The rate used to be `product.gstRate` alone, so an exempt customer was
  // still charged GST and `Company.gstRate` was never consulted.
  const taxSettings = await getSettings("tax", { companyId: context.companyId })

  const pricingSettings = await getSettings("pricing", { companyId: context.companyId })

  const customer = context.customerId
    ? await db.customer.findUnique({
        where: { id: context.customerId },
        select: { customerType: true, priceListId: true },
      })
    : null

  // Fetched once per order rather than per line. `enablePriceLists` is false by
  // default, in which case resolveLinePrice never looks at either.
  const priceLists = pricingSettings.enablePriceLists
    ? await db.priceList.findMany({
        select: {
          id: true,
          isDefault: true,
          type: true,
          status: true,
          validFrom: true,
          validTo: true,
          createdAt: true,
        },
      })
    : []

  const priceListItems = pricingSettings.enablePriceLists
    ? await db.priceListItem.findMany({
        where: { productId: { in: items.map((entry) => entry.productId) } },
        select: {
          id: true,
          priceListId: true,
          productId: true,
          price: true,
          minQty: true,
          maxQty: true,
          discountPercent: true,
          discountFlat: true,
        },
      })
    : []

  const company = context.companyId
    ? await db.company.findUnique({
        where: { id: context.companyId },
        select: { gstRate: true, country: true },
      })
    : null

  const orderItems: Array<{
    productId: string
    productName: string
    sku: string
    quantity: number
    unitPrice: number
    discount: number
    taxRate: number
    taxAmount: number
    total: number
    priceListItemId: string | null
    priceSource: string
  }> = []

  for (const item of items) {
    const product = await db.product.findUnique({ where: { id: item.productId } })

    if (!product) {
      return { ok: false as const, error: `Product ${item.productId} not found` }
    }

    // Was `item.unitPrice ?? product.wholesalePrice`, which ignored the
    // customer's contract list entirely.
    const priced = resolveLinePrice(
      {
        quantity: item.quantity,
        unitPriceOverride: item.unitPrice,
        product: { wholesalePrice: product.wholesalePrice, retailPrice: product.retailPrice },
        customer,
        items: priceListItems.filter((entry) => entry.productId === item.productId),
        lists: priceLists,
      },
      pricingSettings
    )

    const unitPrice = priced.unitPrice
    const discount = item.discount || 0

    let itemSubtotal = unitPrice * item.quantity
    if (discount > 0) {
      itemSubtotal -= itemSubtotal * (discount / 100)
    }

    const lineTax = computeLineTax(
      itemSubtotal,
      { product: { gstRate: product.gstRate, gstExempt: product.gstExempt }, customer, company },
      taxSettings
    )

    const taxAmount = lineTax.taxAmount
    const total = lineTax.total

    subtotal += itemSubtotal
    totalTax += taxAmount

    orderItems.push({
      productId: item.productId,
      productName: product.name,
      sku: product.sku,
      quantity: item.quantity,
      unitPrice,
      discount,
      taxRate: lineTax.rate,
      taxAmount,
      total,
      priceListItemId: priced.priceListItemId,
      priceSource: priced.source,
    })
  }

  return {
    ok: true as const,
    items: orderItems,
    subtotal,
    taxAmount: totalTax,
    totalAmount: subtotal + totalTax,
  }
}

export async function createSalesOrder(input: CreateSalesOrderInput): Promise<CreateSalesOrderResult> {
  if (!input.items || input.items.length === 0) {
    return { ok: false, error: "An order needs at least one line item", code: "no_items" }
  }

  const customer = await db.customer.findUnique({ where: { id: input.customerId } })
  if (!customer) {
    return { ok: false, error: "Customer not found", code: "customer_not_found" }
  }

  const priced = await priceSalesOrder(input.items, {
    customerId: input.customerId,
    companyId: customer.companyId,
  })
  if (!priced.ok) {
    return { ok: false, error: priced.error, code: "product_not_found" }
  }

  // Order-level discounts. `applyOrderDiscounts` was written and never called,
  // so DiscountRule was a table nothing consulted — the same shape as the
  // price lists before Phase 4. Off unless `enableDiscountRules` is on, so
  // landing this changes no total by itself.
  const pricingSettings = await getSettings("pricing", { companyId: customer.companyId })

  const rules = pricingSettings.enableDiscountRules
    ? await db.discountRule.findMany({ where: { status: "active" } })
    : []

  const discount = applyOrderDiscounts(
    {
      subtotal: priced.subtotal,
      quantity: input.items.reduce((sum, item) => sum + item.quantity, 0),
      customerId: input.customerId,
    },
    rules,
    pricingSettings
  )

  const discountedTotal = Math.round((priced.totalAmount - discount.discountAmount) * 100) / 100

  // Checked against what the customer will actually be charged, not the
  // pre-discount figure — otherwise a discount could push an order over the
  // limit that should have fitted under it.
  const credit = await checkCreditForOrder(input.customerId, discountedTotal)

  if (!credit.ok) {
    return {
      ok: false,
      code: "credit_limit",
      error: credit.reason || "Credit check failed",
    }
  }

  const orderNumber = await nextDocumentNumber("salesOrder", {
    db,
    companyId: customer.companyId,
    legacy: generateSalesOrderNumber,
  })
  const resolvedWarehouseId =
    input.warehouseId || (await resolveDefaultWarehouseId(db, customer.companyId))
  const status =
    input.status || (discount.requiresApproval ? "pending_approval" : "draft")

  const order = await createOrderRecord({
    orderNumber,
    customerId: input.customerId,
    locationId: input.locationId || undefined,
    companyId: customer.companyId || null,
    status,
    requiredDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
    customerNotes: input.notes || undefined,
    warehouseId: resolvedWarehouseId,
    subtotal: priced.subtotal,
    taxAmount: priced.taxAmount,
    discountAmount: discount.discountAmount,
    totalAmount: discountedTotal,
    // A rule that demands sign-off routes the order to the existing approval
    // status rather than quietly applying itself.
    requiresApproval: discount.requiresApproval,
    sourceChannel: input.sourceChannel || "admin",
    items: {
      create: priced.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        total: item.total,
        priceListItemId: item.priceListItemId,
        priceSource: item.priceSource,
      })),
    },
    statusLogs: {
      create: {
        status,
        notes: input.createdByAgent ? "Order created by agent" : "Order created",
      },
    },
  })

  if (order.status === "approved" || order.status === "picking") {
    await ensurePickListForOrder(db, order.id)
  }

  try {
    await sendSalesOrderEmail(order.id, "created")
  } catch (error) {
    console.error("Failed to send order creation email:", error)
  }

  return { ok: true, order }
}
