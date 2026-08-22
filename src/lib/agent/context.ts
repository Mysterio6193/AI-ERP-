import { db } from "@/lib/db"
import type { UserRole } from "@/lib/types"

/**
 * Context assembly.
 *
 * Every turn gets a small, deterministic briefing built with SQL - who is
 * talking, what they are allowed to touch, and the handful of live figures that
 * make answers feel informed. This is not retrieval: structured facts come from
 * tools on demand, and this block only carries identity and orientation.
 */

export interface StaffPrincipal {
  kind: "staff"
  userId: string
  name: string
  email: string
  role: UserRole
}

export interface CustomerPrincipal {
  kind: "customer"
  customerId: string
  name: string
  contactPerson: string | null
}

export type AgentPrincipal = StaffPrincipal | CustomerPrincipal

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

export async function resolveStaffPrincipal(userId: string): Promise<StaffPrincipal | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, status: true },
  })

  if (!user || user.status !== "active") {
    return null
  }

  return {
    kind: "staff",
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role as UserRole,
  }
}

export async function resolveCustomerPrincipal(customerId: string): Promise<CustomerPrincipal | null> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, contactPerson: true, status: true },
  })

  if (!customer || customer.status === "blocked") {
    return null
  }

  return {
    kind: "customer",
    customerId: customer.id,
    name: customer.name,
    contactPerson: customer.contactPerson,
  }
}

/** Matches an inbound email address to a customer or one of their contacts. */
export async function resolveCustomerByEmail(address: string) {
  const email = address.trim().toLowerCase()
  if (!email.includes("@")) {
    return null
  }

  const direct = await db.customer.findFirst({
    where: { email: { equals: email }, status: { not: "blocked" } },
    select: { id: true, name: true },
  })

  if (direct) {
    return direct
  }

  const contact = await db.contact.findFirst({
    where: { email: { equals: email }, status: "active" },
    select: { customerId: true },
  })

  if (!contact) {
    return null
  }

  return db.customer.findFirst({
    where: { id: contact.customerId, status: { not: "blocked" } },
    select: { id: true, name: true },
  })
}

/** Matches an inbound phone number to a customer. Tries E.164 and local forms. */
export async function resolveCustomerByPhone(phone: string) {
  const digits = phone.replace(/\D/g, "")
  if (digits.length < 6) {
    return null
  }

  const tail = digits.slice(-9)

  const candidates = await db.customer.findMany({
    where: {
      status: { not: "blocked" },
      OR: [{ phone: { not: null } }, { alternatePhone: { not: null } }],
    },
    select: { id: true, name: true, phone: true, alternatePhone: true },
  })

  return (
    candidates.find((candidate) =>
      [candidate.phone, candidate.alternatePhone]
        .filter(Boolean)
        .some((value) => String(value).replace(/\D/g, "").endsWith(tail))
    ) || null
  )
}

async function buildStaffContext(principal: StaffPrincipal) {
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [ordersToday, openOrders, overdueInvoices, lowStock, myTasks] = await Promise.all([
    db.salesOrder.count({ where: { createdAt: { gte: startOfDay } } }),
    db.salesOrder.count({ where: { status: { in: ["draft", "confirmed", "approved", "picking"] } } }),
    db.invoice.findMany({
      where: { status: { not: "paid" }, dueDate: { lt: now } },
      select: { outstandingAmt: true },
    }),
    db.inventory.count({ where: { quantity: { lte: 0 } } }),
    db.crmTask.count({
      where: { assignedToId: principal.userId, status: "open" },
    }),
  ])

  const overdueTotal = overdueInvoices.reduce((sum, invoice) => sum + invoice.outstandingAmt, 0)

  return [
    `You are talking to ${principal.name} (${principal.email}), role: ${principal.role}.`,
    `Today is ${now.toDateString()}.`,
    `Live figures: ${ordersToday} orders placed today, ${openOrders} orders open, ` +
      `${overdueInvoices.length} overdue invoices totalling ${formatMoney(overdueTotal)}, ` +
      `${lowStock} products out of stock, ${myTasks} open tasks assigned to this user.`,
  ].join("\n")
}

async function buildCustomerContext(principal: CustomerPrincipal) {
  const customer = await db.customer.findUnique({
    where: { id: principal.customerId },
    select: {
      name: true,
      contactPerson: true,
      creditLimit: true,
      creditBalance: true,
      creditStatus: true,
      paymentTerms: true,
    },
  })

  if (!customer) {
    return `You are talking to a customer contact for ${principal.name}.`
  }

  const [recentOrders, openInvoices] = await Promise.all([
    db.salesOrder.findMany({
      where: { customerId: principal.customerId },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        orderNumber: true,
        status: true,
        totalAmount: true,
        orderDate: true,
        items: {
          select: { quantity: true, product: { select: { name: true } } },
          take: 5,
        },
      },
    }),
    db.invoice.findMany({
      where: { customerId: principal.customerId, status: { not: "paid" } },
      select: { invoiceNumber: true, outstandingAmt: true, dueDate: true },
      take: 5,
    }),
  ])

  const available = Math.max(customer.creditLimit - customer.creditBalance, 0)

  const lines = [
    `You are talking to ${customer.contactPerson || "a contact"} from ${customer.name}.`,
    `Account: credit status ${customer.creditStatus}, ${formatMoney(available)} credit available, payment terms net ${customer.paymentTerms}.`,
  ]

  if (recentOrders.length) {
    lines.push(
      "Recent orders: " +
        recentOrders
          .map(
            (order) =>
              `${order.orderNumber} (${order.status}, ${formatMoney(order.totalAmount)}: ` +
              order.items.map((item) => `${item.quantity}x ${item.product?.name}`).join(", ") +
              ")"
          )
          .join(" | ")
    )
  }

  if (openInvoices.length) {
    lines.push(
      "Unpaid invoices: " +
        openInvoices
          .map((invoice) => `${invoice.invoiceNumber} ${formatMoney(invoice.outstandingAmt)}`)
          .join(", ")
    )
  }

  return lines.join("\n")
}

export async function buildPrincipalContext(principal: AgentPrincipal) {
  return principal.kind === "staff"
    ? buildStaffContext(principal)
    : buildCustomerContext(principal)
}
