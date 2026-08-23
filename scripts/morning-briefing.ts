import { db } from "../src/lib/db"
import { sendTelegramMessage } from "../src/lib/agent/channels/telegram"
import { money } from "../src/lib/agent/tools/shared"

async function runMorningBriefing() {
  console.log("Compiling SupplySure OS Daily Morning Briefing...")
  const now = new Date()
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const [todayOrders, activeRoutes, overdueInvoices, lowStock, hotLeads] = await Promise.all([
    db.salesOrder.findMany({
      where: { createdAt: { gte: dayStart } },
      select: { totalAmount: true },
    }),
    db.deliveryRoute.findMany({
      where: { routeDate: { gte: dayStart } },
      include: { deliveries: true },
    }),
    db.invoice.findMany({
      where: { status: { not: "paid" }, dueDate: { lt: now } },
      select: { outstandingAmt: true },
    }),
    db.inventory.findMany({
      where: { quantity: { lte: 0 } },
      select: { product: { select: { name: true } } },
      take: 3,
    }),
    db.lead.findMany({
      where: { status: "new" },
      select: { businessName: true, estimatedValue: true },
      take: 3,
    }),
  ])

  const orderCount = todayOrders.length
  const totalRevenue = money(todayOrders.reduce((acc, o) => acc + o.totalAmount, 0))
  const routeCount = activeRoutes.length
  const totalStops = activeRoutes.reduce((acc, r) => acc + r.deliveries.length, 0)
  const overdueTotal = money(overdueInvoices.reduce((acc, i) => acc + i.outstandingAmt, 0))

  const formattedDate = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const briefingText = [
    `☀️ *Good Morning Team!* — _${formattedDate}_`,
    `Here is your SupplySure OS morning operational briefing:`,
    ``,
    `📦 *Orders Today:* ${orderCount} order(s) ($${totalRevenue.toLocaleString()})`,
    `🚚 *Fleet & Deliveries:* ${routeCount} run(s) active across ${totalStops} stop(s)`,
    `💰 *Receivables Due:* $${overdueTotal.toLocaleString()} in overdue invoices`,
    lowStock.length > 0 ? `⚠️ *Stock Attention:* ${lowStock.map((s) => s.product.name).join(", ")}` : `✅ *Inventory:* Core stock levels healthy`,
    hotLeads.length > 0 ? `🎯 *New Leads:* ${hotLeads.map((l) => `${l.businessName} ($${l.estimatedValue || 0}/mo)`).join(", ")}` : ``,
    `\nLet's have a great and productive day! 🚀\n_— SupplySure OS Automated Morning Dispatch_`,
  ].filter(Boolean).join("\n")

  console.log("\nBriefing Content:\n" + briefingText)

  const staffIdentities = await db.channelIdentity.findMany({
    where: { channel: "telegram", status: "active", userId: { not: null } },
    select: { externalId: true },
  })

  let sent = 0
  for (const identity of staffIdentities) {
    if (identity.externalId && !identity.externalId.startsWith("pending:")) {
      await sendTelegramMessage(identity.externalId, briefingText)
      sent++
    }
  }

  console.log(`\n✓ Dispatched morning briefing to ${sent} staff member(s).`)
}

runMorningBriefing()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
