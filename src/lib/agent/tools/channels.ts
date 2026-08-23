import { z } from "zod"

import { db } from "@/lib/db"
import { sendTelegramMessage } from "../channels/telegram"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff, money } from "./shared"

/** Multi-Channel Operations, Agent Routing & Morning Briefings. */

export function buildChannelTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    listAgentChannels: defineTool({
      description: "List all active communication channels, bots, and linked staff/customer identities.",
      inputSchema: z.object({}),
      execute: async () => {
        const identities = await db.channelIdentity.findMany({
          where: { status: "active" },
          include: {
            user: { select: { name: true, role: true, email: true } },
            customer: { select: { name: true, phone: true } },
          },
        })

        return {
          totalConnected: identities.length,
          channels: identities.map((i) => ({
            id: i.id,
            channel: i.channel,
            externalId: i.externalId,
            linkedTo: i.user ? `Staff: ${i.user.name} (${i.user.role})` : i.customer ? `Customer: ${i.customer.name}` : "Unlinked",
            lastSeenAt: i.lastSeenAt,
          })),
        }
      },
    }),

    generateMorningBriefing: defineTool({
      description:
        "Generate a comprehensive ERP morning operational briefing: today's order dispatch load, delivery runs, inventory shortages, overdue collections, and hot sales leads.",
      inputSchema: z.object({
        includeGreeting: z.boolean().optional().default(true),
      }),
      execute: async ({ includeGreeting = true }) => {
        const now = new Date()
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const dayEnd = new Date(dayStart.getTime() + 86400000)

        const [
          todayOrders,
          activeRoutes,
          stockouts,
          overdueInvoices,
          newLeads,
        ] = await Promise.all([
          db.salesOrder.findMany({
            where: { createdAt: { gte: dayStart, lt: dayEnd } },
            select: { id: true, orderNumber: true, totalAmount: true, status: true, customer: { select: { name: true } } },
          }),
          db.deliveryRoute.findMany({
            where: { routeDate: { gte: dayStart, lt: dayEnd } },
            include: { driver: { select: { name: true } }, deliveries: true },
          }),
          db.inventory.findMany({
            where: { quantity: { lte: 0 } },
            select: { product: { select: { name: true, sku: true } } },
            take: 5,
          }),
          db.invoice.findMany({
            where: { status: { not: "paid" }, dueDate: { lt: now } },
            select: { outstandingAmt: true, customer: { select: { name: true } } },
            take: 5,
          }),
          db.lead.findMany({
            where: { status: "new" },
            select: { businessName: true, estimatedValue: true, source: true },
            take: 3,
          }),
        ])

        const totalRevenueToday = money(todayOrders.reduce((sum, o) => sum + o.totalAmount, 0))
        const totalOverdue = money(overdueInvoices.reduce((sum, inv) => sum + inv.outstandingAmt, 0))

        const greeting = `🌅 Good morning team! Here is your SupplySure OS Daily Operational Briefing for ${now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}:`

        return {
          greeting: includeGreeting ? greeting : undefined,
          date: now.toISOString().split("T")[0],
          dispatchSummary: {
            ordersTodayCount: todayOrders.length,
            revenueToday: totalRevenueToday,
            activeRoutesCount: activeRoutes.length,
            totalStops: activeRoutes.reduce((acc, r) => acc + r.deliveries.length, 0),
          },
          inventoryAlerts: {
            stockoutCount: stockouts.length,
            criticalItems: stockouts.map((s) => s.product.name),
          },
          financeReceivables: {
            overdueCount: overdueInvoices.length,
            totalOverdueAmount: totalOverdue,
            priorityAccounts: overdueInvoices.map((i) => i.customer.name),
          },
          salesPipeline: {
            newLeadsCount: newLeads.length,
            hotLeads: newLeads.map((l) => `${l.businessName} ($${l.estimatedValue || 0}/mo)`),
          },
        }
      },
    }),

    sendMorningGreeting: defineTool({
      description:
        "Compile and dispatch the official morning greeting and operational summary to all staff Telegram and communication channels.",
      inputSchema: z.object({
        customMessage: z.string().optional().describe("Optional custom announcement to include in the briefing"),
      }),
      execute: async ({ customMessage }) => {
        const now = new Date()
        const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        const [todayOrders, activeRoutes, overdueInvoices, lowStock] = await Promise.all([
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
        ])

        const orderCount = todayOrders.length
        const totalRevenue = money(todayOrders.reduce((acc, o) => acc + o.totalAmount, 0))
        const routeCount = activeRoutes.length
        const totalStops = activeRoutes.reduce((acc, r) => acc + r.deliveries.length, 0)
        const overdueTotal = money(overdueInvoices.reduce((acc, i) => acc + i.outstandingAmt, 0))

        const formattedDate = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })
        const greetingText = [
          `☀️ *Good Morning Team!* — _${formattedDate}_`,
          `Welcome to today's operations run. Here is your morning business snapshot:`,
          ``,
          `📦 *Today's Load:* ${orderCount} order(s) placed ($${totalRevenue.toLocaleString()})`,
          `🚚 *Fleet & Routes:* ${routeCount} active run(s) across ${totalStops} delivery stop(s)`,
          `💰 *Receivables:* $${overdueTotal.toLocaleString()} pending in overdue invoices`,
          lowStock.length > 0 ? `⚠️ *Stock Attention:* ${lowStock.map((s) => s.product.name).join(", ")}` : `✅ *Inventory:* Core stock levels healthy`,
          customMessage ? `\n📢 *Note:* ${customMessage}` : "",
          `\nLet's have a productive day! 🚀\n_— SupplySure OS Automated Morning Dispatch_`,
        ].filter(Boolean).join("\n")

        // Send to individual staff DMs
        const staffIdentities = await db.channelIdentity.findMany({
          where: { channel: "telegram", status: "active", userId: { not: null } },
          select: { externalId: true },
        })

        let sent = 0
        for (const identity of staffIdentities) {
          if (identity.externalId && !identity.externalId.startsWith("pending:")) {
            await sendTelegramMessage(identity.externalId, greetingText)
            sent++
          }
        }

        // Also send to all active group channels
        const groupChannels = await db.agentGroupChannel.findMany({
          where: { channel: "telegram", status: "active" },
          select: { externalId: true, name: true },
        })

        for (const group of groupChannels) {
          await sendTelegramMessage(group.externalId, greetingText)
          sent++
        }

        return {
          ok: true as const,
          sentToCount: sent,
          briefingContent: greetingText,
          message: `Morning greeting successfully broadcast to ${sent} recipient(s) (staff DMs + group channels).`,
        }
      },
    }),

    // ── Group Channel Management ──

    listGroupChannels: defineTool({
      description:
        "List all registered Telegram group channels where the AI agent is active. Shows group name, purpose, autoReply setting, and status.",
      inputSchema: z.object({}),
      execute: async () => {
        const groups = await db.agentGroupChannel.findMany({
          orderBy: { createdAt: "desc" },
        })

        return {
          totalGroups: groups.length,
          groups: groups.map((g) => ({
            id: g.id,
            name: g.name,
            purpose: g.purpose,
            autoReply: g.autoReply,
            status: g.status,
            telegramChatId: g.externalId,
            createdAt: g.createdAt,
          })),
        }
      },
    }),

    updateGroupChannel: defineTool({
      description:
        "Update a Telegram group channel's settings: purpose label, autoReply toggle (when on, the bot responds to ALL messages in the group, not just @mentions), or status (active/paused/archived).",
      inputSchema: z.object({
        groupId: z.string().describe("The AgentGroupChannel ID"),
        purpose: z.string().optional().describe("New purpose label, e.g. 'operations', 'sales', 'warehouse'"),
        autoReply: z.boolean().optional().describe("When true, bot responds to every message in the group"),
        status: z.enum(["active", "paused", "archived"]).optional().describe("Channel status"),
        description: z.string().optional().describe("Optional description of what this group is for"),
      }),
      execute: async ({ groupId, purpose, autoReply, status, description }) => {
        const group = await db.agentGroupChannel.findUnique({ where: { id: groupId } })
        if (!group) {
          return { ok: false as const, error: "Group channel not found" }
        }

        const updated = await db.agentGroupChannel.update({
          where: { id: groupId },
          data: {
            ...(purpose !== undefined ? { purpose } : {}),
            ...(autoReply !== undefined ? { autoReply } : {}),
            ...(status !== undefined ? { status } : {}),
            ...(description !== undefined ? { description } : {}),
          },
        })

        return {
          ok: true as const,
          group: {
            id: updated.id,
            name: updated.name,
            purpose: updated.purpose,
            autoReply: updated.autoReply,
            status: updated.status,
            description: updated.description,
          },
        }
      },
    }),

    postToGroupChannel: defineTool({
      description:
        "Send a message from the AI agent into a specific Telegram group channel. Use this to broadcast announcements, alerts, or operational updates to team groups.",
      inputSchema: z.object({
        groupId: z.string().optional().describe("The AgentGroupChannel ID. If not provided, sends to all active groups."),
        purpose: z.string().optional().describe("Send to all groups matching this purpose (e.g. 'operations', 'sales'). Alternative to groupId."),
        message: z.string().describe("The message text to send to the group(s)"),
      }),
      execute: async ({ groupId, purpose, message }) => {
        let groups

        if (groupId) {
          const group = await db.agentGroupChannel.findUnique({ where: { id: groupId } })
          groups = group ? [group] : []
        } else if (purpose) {
          groups = await db.agentGroupChannel.findMany({
            where: { channel: "telegram", status: "active", purpose },
          })
        } else {
          groups = await db.agentGroupChannel.findMany({
            where: { channel: "telegram", status: "active" },
          })
        }

        if (groups.length === 0) {
          return { ok: false as const, error: "No matching group channels found" }
        }

        let sent = 0
        for (const group of groups) {
          await sendTelegramMessage(group.externalId, message)
          sent++
        }

        return {
          ok: true as const,
          sentToGroups: sent,
          groupNames: groups.map((g) => g.name),
          message: `Message sent to ${sent} group channel(s).`,
        }
      },
    }),
  }
}
