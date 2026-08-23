import { z } from "zod"

import { db } from "@/lib/db"
import { sendTelegramMessage } from "../channels/telegram"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Hermes Alerting & Team Notifications.
 * Dispatches high-priority alerts to staff members and channels.
 */

export function buildNotificationTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  return {
    sendStaffAlert: defineTool({
      description:
        "Send an immediate operational alert or reminder to all active staff Telegram channels or a specific user.",
      inputSchema: z.object({
        level: z.enum(["info", "warning", "critical"]).describe("Alert severity level"),
        message: z.string().describe("The alert message text"),
        category: z.enum(["inventory", "finance", "sales", "safety", "general"]).optional().default("general"),
      }),
      execute: async ({ level, message, category }) => {
        try {
          const emoji = level === "critical" ? "🚨 CRITICAL ALERT:" : level === "warning" ? "⚠️ WARNING:" : "ℹ️ UPDATE:"
          const fullMessage = `${emoji} [${category.toUpperCase()}]\n${message}\n\n— SupplySure Automated Dispatch`

          // Find active staff Telegram identities
          const staffIdentities = await db.channelIdentity.findMany({
            where: { channel: "telegram", status: "active", userId: { not: null } },
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
              recipient: `staff_broadcast (${sentCount} recipients)`,
              message: fullMessage,
              status: "sent",
            },
          })

          return {
            ok: true as const,
            level,
            sentToCount: sentCount,
            message: `Dispatched ${level} alert to ${sentCount} staff member(s).`,
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
