import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { analyseCadence, daysBetween } from "@/lib/crm"
import { db } from "@/lib/db"

/**
 * The account 360.
 *
 * Everything known about one customer in a single payload: who to talk to,
 * what they buy, what they owe, what they have complained about, and whether
 * their ordering rhythm is holding. Assembled server-side so the page renders
 * one request rather than eight.
 */

function round(value: number) {
  return Number(value.toFixed(2))
}

/**
 * A single health score with its reasons attached. Deliberately explainable -
 * a score nobody can interrogate gets ignored.
 */
function scoreAccount(input: {
  cadenceOverdue: number
  overdueValue: number
  creditUsage: number
  openCases: number
  monthsActive: number
}) {
  const reasons: string[] = []
  let score = 100

  if (input.cadenceOverdue > 0) {
    const penalty = Math.min(35, 10 + input.cadenceOverdue)
    score -= penalty
    reasons.push(`ordering ${input.cadenceOverdue} days beyond its usual rhythm (-${penalty})`)
  }

  if (input.overdueValue > 0) {
    const penalty = Math.min(25, 10 + Math.log10(input.overdueValue + 1) * 5)
    score -= penalty
    reasons.push(`${round(input.overdueValue)} overdue (-${Math.round(penalty)})`)
  }

  if (input.creditUsage > 0.8) {
    score -= 15
    reasons.push(`credit ${Math.round(input.creditUsage * 100)}% used (-15)`)
  }

  if (input.openCases > 0) {
    const penalty = Math.min(20, input.openCases * 10)
    score -= penalty
    reasons.push(`${input.openCases} open case${input.openCases > 1 ? "s" : ""} (-${penalty})`)
  }

  if (input.monthsActive >= 12 && input.cadenceOverdue === 0) {
    score += 5
    reasons.push("long-standing and ordering steadily (+5)")
  }

  const bounded = Math.max(0, Math.min(100, Math.round(score)))

  return {
    score: bounded,
    band: bounded >= 75 ? "healthy" : bounded >= 45 ? "watch" : "at risk",
    reasons,
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
  if (auth.response) {
    return auth.response
  }

  const { id } = await context.params

  const customer = await db.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      tradingName: true,
      abn: true,
      contactPerson: true,
      email: true,
      phone: true,
      alternatePhone: true,
      website: true,
      industry: true,
      customerType: true,
      status: true,
      creditLimit: true,
      creditBalance: true,
      creditStatus: true,
      creditRating: true,
      paymentTerms: true,
      salesRepId: true,
      createdAt: true,
      locations: {
        select: { id: true, address: true, city: true, state: true, postcode: true },
      },
    },
  })

  if (!customer) {
    return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 })
  }

  const [contacts, orders, invoices, cases, opportunities, tasks, activities, comms, rep] =
    await Promise.all([
      db.contact.findMany({
        where: { customerId: id, status: "active" },
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          role: true,
          jobTitle: true,
          email: true,
          phone: true,
          mobile: true,
          isPrimary: true,
          isDecisionMaker: true,
          preferredChannel: true,
          notes: true,
        },
      }),
      db.salesOrder.findMany({
        where: { customerId: id },
        orderBy: { orderDate: "desc" },
        take: 50,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalAmount: true,
          orderDate: true,
          sourceChannel: true,
          items: { select: { quantity: true, total: true, product: { select: { name: true } } } },
        },
      }),
      db.invoice.findMany({
        where: { customerId: id },
        orderBy: { dueDate: "desc" },
        take: 25,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          outstandingAmt: true,
          dueDate: true,
        },
      }),
      db.case.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          caseNumber: true,
          subject: true,
          category: true,
          severity: true,
          status: true,
          createdAt: true,
          resolution: true,
        },
      }),
      db.opportunity.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          stage: true,
          value: true,
          probability: true,
          expectedCloseDate: true,
        },
      }),
      db.crmTask.findMany({
        where: { customerId: id, status: "open" },
        orderBy: { dueAt: "asc" },
        select: { id: true, title: true, type: true, dueAt: true, priority: true },
      }),
      db.activity.findMany({
        where: { customerId: id },
        orderBy: { occurredAt: "desc" },
        take: 40,
        select: {
          id: true,
          type: true,
          subject: true,
          body: true,
          outcome: true,
          occurredAt: true,
          createdByAgent: true,
          contact: { select: { name: true } },
          user: { select: { name: true } },
        },
      }),
      db.communicationLog.findMany({
        where: { customerId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          method: true,
          direction: true,
          subject: true,
          message: true,
          status: true,
          createdAt: true,
        },
      }),
      db.customer
        .findUnique({ where: { id }, select: { salesRepId: true } })
        .then(async (row) =>
          row?.salesRepId
            ? db.user.findUnique({
                where: { id: row.salesRepId },
                select: { id: true, name: true, email: true },
              })
            : null
        ),
    ])

  const activeOrders = orders.filter((order) => order.status !== "cancelled")
  const cadence = analyseCadence(activeOrders)
  const totalSpend = activeOrders.reduce((sum, order) => sum + order.totalAmount, 0)
  const overdueValue = invoices
    .filter((invoice) => invoice.status !== "paid" && invoice.dueDate < new Date())
    .reduce((sum, invoice) => sum + invoice.outstandingAmt, 0)

  // What they actually buy, so a rep can talk about the right products.
  const productCounts = new Map<string, { quantity: number; value: number }>()
  for (const order of activeOrders) {
    for (const item of order.items) {
      const name = item.product?.name
      if (!name) {
        continue
      }
      const entry = productCounts.get(name) || { quantity: 0, value: 0 }
      entry.quantity += item.quantity
      entry.value += item.total
      productCounts.set(name, entry)
    }
  }

  const openCases = cases.filter((record) => ["open", "in_progress"].includes(record.status))

  const health = scoreAccount({
    cadenceOverdue: cadence?.overdueBy ?? 0,
    overdueValue,
    creditUsage: customer.creditLimit > 0 ? customer.creditBalance / customer.creditLimit : 0,
    openCases: openCases.length,
    monthsActive: Math.floor(daysBetween(customer.createdAt) / 30),
  })

  return NextResponse.json({
    success: true,
    data: {
      customer: {
        ...customer,
        availableCredit: round(Math.max(customer.creditLimit - customer.creditBalance, 0)),
        creditUsagePercent:
          customer.creditLimit > 0
            ? Math.round((customer.creditBalance / customer.creditLimit) * 100)
            : null,
        salesRep: rep,
      },
      health,
      cadence,
      stats: {
        orderCount: activeOrders.length,
        totalSpend: round(totalSpend),
        averageOrderValue: activeOrders.length ? round(totalSpend / activeOrders.length) : 0,
        overdueValue: round(overdueValue),
        openInvoices: invoices.filter((invoice) => invoice.status !== "paid").length,
        openCases: openCases.length,
        customerSinceDays: daysBetween(customer.createdAt),
      },
      topProducts: [...productCounts.entries()]
        .sort((a, b) => b[1].value - a[1].value)
        .slice(0, 8)
        .map(([name, entry]) => ({
          product: name,
          quantity: entry.quantity,
          value: round(entry.value),
        })),
      contacts,
      orders: orders.slice(0, 15).map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: round(order.totalAmount),
        orderDate: order.orderDate,
        channel: order.sourceChannel,
        lineCount: order.items.length,
      })),
      invoices: invoices.map((invoice) => ({
        ...invoice,
        totalAmount: round(invoice.totalAmount),
        outstandingAmt: round(invoice.outstandingAmt),
        daysOverdue:
          invoice.status !== "paid" && invoice.dueDate < new Date()
            ? daysBetween(invoice.dueDate)
            : 0,
      })),
      cases,
      opportunities: opportunities.map((opportunity) => ({
        ...opportunity,
        value: round(opportunity.value),
      })),
      tasks,
      activities,
      communications: comms,
    },
  })
}
