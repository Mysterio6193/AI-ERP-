import { sendSalesOrderEmail } from "@/lib/communications"
import { checkCreditForOrder } from "@/lib/credit"
import { db } from "@/lib/db"
import { ensurePickListForOrder, resolveDefaultWarehouseId } from "@/lib/pick-lists"
import { getSettings } from "@/lib/settings/service"
import { computeLineTax } from "@/lib/tax"

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

  const customer = context.customerId
    ? await db.customer.findUnique({
        where: { id: context.customerId },
        select: { customerType: true },
      })
    : null

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
  }> = []

  for (const item of items) {
    const product = await db.product.findUnique({ where: { id: item.productId } })

    if (!product) {
      return { ok: false as const, error: `Product ${item.productId} not found` }
    }

    const unitPrice = item.unitPrice ?? product.wholesalePrice
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

  // Exposure includes orders already placed but not yet invoiced. Checking
  // creditBalance alone let a customer place unlimited orders against a limit,
  // because that field only moves when an invoice is created.
  const credit = await checkCreditForOrder(input.customerId, priced.totalAmount)

  if (!credit.ok) {
    return {
      ok: false,
      code: "credit_limit",
      error: credit.reason || "Credit check failed",
    }
  }

  const orderNumber = await generateSalesOrderNumber()
  const resolvedWarehouseId =
    input.warehouseId || (await resolveDefaultWarehouseId(db, customer.companyId))
  const status = input.status || "draft"

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
    totalAmount: priced.totalAmount,
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
