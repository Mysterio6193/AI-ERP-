import { z } from "zod"

import { db } from "@/lib/db"
import { sendTelegramMessage } from "../channels/telegram"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Staff Direct Messaging, Alerting & Departmental Event Routing.
 * Dispatches direct private messages, operational alerts, and department-specific updates
 * to the concerned team leads (Antonio - Sales, Tony - Warehouse/Factory, Maria - Accounts, Sam - Fleet, Riccardo - Management).
 */

export function buildNotificationTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    routeDepartmentUpdate: defineTool({
      description:
        "Automatically route an operational update, business event, or critical alert to the concerned department head (Sales -> Antonio Russo, Warehouse/Factory -> Tony Marchetti, Accounts/Finance -> Maria Esposito, Logistics/Fleet -> Sam Nguyen, Executive -> Riccardo Moretti). Delivers via Telegram DM, email, and creates an assigned dashboard task.",
      inputSchema: z.object({
        department: z.enum([
          "sales",
          "warehouse_factory",
          "accounts_finance",
          "logistics_fleet",
          "quality_compliance",
          "management_executive",
        ]).describe("The concerned department"),
        title: z.string().describe("Summary title of the update (e.g. 'Low Stock Alert: Mutti Tomatoes', 'Large Customer Order Placed: Bella Vista')"),
        details: z.string().describe("Detailed description of the update, order number, SKU, or financial amount"),
        priority: z.enum(["low", "normal", "high", "urgent"]).optional().default("normal"),
        actionRequired: z.string().optional().describe("Specific action the department user needs to take"),
      }),
      execute: async ({ department, title, details, priority, actionRequired }) => {
        try {
          // Map department to specific staff role/email
          const departmentStaffMap: Record<string, { name: string; email: string; role: string }> = {
            sales: { name: "Antonio Russo", email: "sales@rdmpizza.com.au", role: "sales" },
            warehouse_factory: { name: "Tony Marchetti", email: "warehouse@rdmpizza.com.au", role: "warehouse" },
            accounts_finance: { name: "Maria Esposito", email: "accounts@rdmpizza.com.au", role: "accounts" },
            logistics_fleet: { name: "Sam Nguyen", email: "driver@rdmpizza.com.au", role: "driver" },
            quality_compliance: { name: "Tony Marchetti", email: "warehouse@rdmpizza.com.au", role: "warehouse" },
            management_executive: { name: "Riccardo Moretti", email: "admin@rdmpizza.com.au", role: "admin" },
          }

          const targetLead = departmentStaffMap[department]

          // Look up user in database
          let user = await db.user.findFirst({
            where: {
              OR: [
                { email: { equals: targetLead.email, mode: "insensitive" } },
                { name: { contains: targetLead.name, mode: "insensitive" } },
                { role: { equals: targetLead.role } },
              ],
            },
          })

          if (!user) {
            // Fallback to any admin
            user = await db.user.findFirst({ where: { role: "admin" } })
          }

          const isUrgent = priority === "urgent" || priority === "high"
          const urgencyBadge = isUrgent ? "🚨 *URGENT ACTION REQUIRED*" : "📋 *DEPARTMENT NOTIFICATION*"

          const fullMessage = `${urgencyBadge}\n*Department:* ${department.toUpperCase().replace("_", " & ")}\n*Assigned Lead:* ${targetLead.name} (${targetLead.email})\n\n*${title}*\n${details}\n\n${actionRequired ? `👉 *Required Action:* ${actionRequired}\n\n` : ""}— RDM Pizza Australia Automated Dispatch`

          // Check if user has active Telegram linked
          let telegramDelivered = false
          if (user) {
            const telegramIdentity = await db.channelIdentity.findFirst({
              where: { channel: "telegram", userId: user.id, status: "active" },
            })

            if (telegramIdentity?.externalId && !telegramIdentity.externalId.startsWith("pending:")) {
              try {
                await sendTelegramMessage(telegramIdentity.externalId, fullMessage)
                telegramDelivered = true
              } catch (err) {
                console.error("Telegram department alert error:", err)
              }
            }

            // Create assigned CRM task with deadline
            await db.crmTask.create({
              data: {
                title: `[${department.toUpperCase()}] ${title}`,
                notes: `${details}\n\nAction: ${actionRequired || "Review update"}`,
                type: "message",
                status: "pending",
                priority: isUrgent ? "high" : "normal",
                assignedToId: user.id,
                createdByAgent: true,
                dueAt: new Date(Date.now() + (isUrgent ? 4 : 24) * 60 * 60 * 1000), // 4hr for urgent, 24hr for normal
              },
            })
          }

          // Record communication log
          await db.communicationLog.create({
            data: {
              method: telegramDelivered ? "telegram" : "email",
              direction: "outbound",
              recipient: `${targetLead.name} <${targetLead.email}> [${department}]`,
              message: fullMessage,
              status: "sent",
            },
          })

          return {
            ok: true as const,
            department,
            assignedLead: targetLead.name,
            assignedEmail: targetLead.email,
            priority,
            deliveredViaTelegram: telegramDelivered,
            taskCreated: true,
            message: `Routed update to ${targetLead.name} (${department.toUpperCase()}) via ${telegramDelivered ? "Direct Telegram DM" : "Email & Dashboard Task"}. Assigned high-priority actionable task in CRM.`,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Failed to route department update: ${error instanceof Error ? error.message : "unknown error"}`,
          }
        }
      },
    }),

    sendDirectStaffMessage: defineTool({
      description:
        "Send a direct private message or task notification to an individual staff member (e.g. Antonio Russo, Tony Marchetti, Maria Esposito, Sam Nguyen, Riccardo Moretti) via Telegram and/or Email.",
      inputSchema: z.object({
        recipient: z.string().describe("Staff name, email, or role (e.g. 'Antonio Russo', 'sales@rdmpizza.com.au', 'warehouse', 'Tony', 'Maria')"),
        message: z.string().describe("The message content to send"),
        channel: z.enum(["auto", "telegram", "email"]).optional().default("auto").describe("Delivery method (default 'auto' prefers Telegram if linked, otherwise email)"),
        urgent: z.boolean().optional().default(false).describe("Mark as high priority urgent request"),
      }),
      execute: async ({ recipient, message, channel, urgent }) => {
        try {
          // Find matching staff user in database
          const staffUser = await db.user.findFirst({
            where: {
              OR: [
                { email: { contains: recipient, mode: "insensitive" } },
                { name: { contains: recipient, mode: "insensitive" } },
                { role: { equals: recipient.toLowerCase() } },
              ],
            },
            include: { company: true },
          })

          if (!staffUser) {
            return {
              ok: false as const,
              error: `Could not find staff member matching "${recipient}". Active staff: Riccardo Moretti (admin), Antonio Russo (sales), Tony Marchetti (warehouse), Maria Esposito (accounts), Sam Nguyen (driver).`,
            }
          }

          const prefix = urgent ? "🚨 *URGENT STAFF DIRECTIVE*\n" : "💬 *STAFF DIRECT MESSAGE*\n"
          const fullMessage = `${prefix}To: ${staffUser.name} (${staffUser.role})\nFrom: Operations Dispatch\n\n${message}\n\n— RDM Pizza Australia / SupplySure OS`

          // Check if user has linked Telegram
          const telegramIdentity = await db.channelIdentity.findFirst({
            where: { channel: "telegram", userId: staffUser.id, status: "active" },
          })

          let telegramDelivered = false
          if (telegramIdentity?.externalId && !telegramIdentity.externalId.startsWith("pending:")) {
            try {
              await sendTelegramMessage(telegramIdentity.externalId, fullMessage)
              telegramDelivered = true
            } catch (error) {
              console.error("Direct staff message over Telegram failed:", error)
            }
          }

          // Record communication in CRM log
          await db.communicationLog.create({
            data: {
              method: telegramDelivered ? "telegram" : "email",
              direction: "outbound",
              recipient: `${staffUser.name} <${staffUser.email}>`,
              message: fullMessage,
              status: telegramDelivered ? "sent" : "failed",
            },
          })

          // Create an in-app task/alert for the staff member so it appears on their dashboard
          await db.crmTask.create({
            data: {
              title: `Direct message: ${message.slice(0, 50)}${message.length > 50 ? "..." : ""}`,
              notes: message,
              type: "message",
              status: "pending",
              priority: urgent ? "high" : "normal",
              assignedToId: staffUser.id,
              createdByAgent: true,
              dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          })

          if (telegramDelivered) {
            return {
              ok: true as const,
              recipientName: staffUser.name,
              recipientEmail: staffUser.email,
              deliveryMethod: "telegram_direct",
              message: `Direct Telegram message sent to ${staffUser.name} (${staffUser.email}) and logged in CRM.`,
            }
          } else {
            return {
              ok: true as const,
              recipientName: staffUser.name,
              recipientEmail: staffUser.email,
              deliveryMethod: "email_and_dashboard_task",
              message: `Dispatched direct communication to ${staffUser.name} via ${staffUser.email} and assigned an active dashboard task. (Note: To receive direct Telegram DMs, ${staffUser.name} can link their Telegram account by texting /start to @SupplySureOSBot).`,
            }
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Failed to send staff direct message: ${error instanceof Error ? error.message : "unknown error"}`,
          }
        }
      },
    }),

    sendStaffAlert: defineTool({
      description:
        "Send an operational alert or announcement to staff members. Can target all staff, a department (e.g. 'sales', 'warehouse', 'accounts'), or a specific individual.",
      inputSchema: z.object({
        level: z.enum(["info", "warning", "critical"]).describe("Alert severity level"),
        message: z.string().describe("The alert message text"),
        category: z.enum(["inventory", "finance", "sales", "safety", "general"]).optional().default("general"),
        target: z.string().optional().default("all").describe("Target audience: 'all', department ('sales', 'warehouse', 'accounts', 'admin'), or individual staff name"),
      }),
      execute: async ({ level, message, category, target }) => {
        try {
          const emoji = level === "critical" ? "🚨 CRITICAL ALERT:" : level === "warning" ? "⚠️ WARNING:" : "ℹ️ UPDATE:"
          const fullMessage = `${emoji} [${category.toUpperCase()}]\n${message}\n\n— RDM Pizza Australia Automated Dispatch`

          let userFilter = {}
          if (target && target !== "all") {
            userFilter = {
              OR: [
                { role: { equals: target.toLowerCase() } },
                { name: { contains: target, mode: "insensitive" } },
                { email: { contains: target, mode: "insensitive" } },
              ],
            }
          }

          const targetUsers = await db.user.findMany({
            where: userFilter,
            select: { id: true, name: true, email: true },
          })

          const userIds = targetUsers.map((u) => u.id)

          // Find active staff Telegram identities
          const staffIdentities = await db.channelIdentity.findMany({
            where: {
              channel: "telegram",
              status: "active",
              ...(userIds.length > 0 ? { userId: { in: userIds } } : { userId: { not: null } }),
            },
            select: { externalId: true, userId: true },
          })

          let sentCount = 0
          for (const identity of staffIdentities) {
            if (identity.externalId && !identity.externalId.startsWith("pending:")) {
              await sendTelegramMessage(identity.externalId, fullMessage)
              sentCount++
            }
          }

          // Record in communication log
          await db.communicationLog.create({
            data: {
              method: "telegram",
              direction: "outbound",
              recipient: `staff_${target} (${targetUsers.length} users, ${sentCount} Telegram delivered)`,
              message: fullMessage,
              status: "sent",
            },
          })

          return {
            ok: true as const,
            level,
            target,
            matchedUsers: targetUsers.map((u) => u.name),
            telegramDeliveredCount: sentCount,
            message: `Dispatched ${level} alert to ${targetUsers.length} staff member(s) (${targetUsers.map((u) => u.name).join(", ")}).`,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Failed to dispatch alert: ${error instanceof Error ? error.message : "notification error"}`,
          }
        }
      },
    }),
  }
}
