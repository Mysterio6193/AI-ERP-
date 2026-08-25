import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"
import { createRoutine, listRoutines, stopRoutine } from "@/lib/agent/routines"

/**
 * Automation, Productivity & Workflow Tools.
 *
 * Hermes-grade tools for reminders, recurring reports, workflow automation,
 * translation, QR codes, thread summarization, and checklists.
 */

export function buildAutomationTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  const userId = principal.kind === "staff" ? principal.userId : null

  return {
    createRoutine: defineTool({
      description:
        "Turn an instruction into something that runs on its own — 'do this every Monday', 'check that every morning'. Creates a scheduled agent that reports back. Use this whenever someone asks for something recurring.",
      inputSchema: z.object({
        name: z.string().describe("Short name, e.g. 'Overnight stock check'"),
        instruction: z.string().describe("What to do each time it runs, in plain words"),
        schedule: z.string().describe("hourly, daily, weekdays, weekly, fortnightly, monthly, end_of_month, or a cron expression"),
        persona: z.string().optional().describe("Which agent it behaves as: ops, warehouse, accounts, sales, purchasing"),
      }),
      execute: async ({ name, instruction, schedule, persona }) => {
        if (principal.kind !== "staff") {
          return { ok: false as const, error: "Only staff can create routines." }
        }

        const result = await createRoutine({
          name, instruction, schedule, persona,
          runAsUserId: principal.userId,
        })

        if (!result.ok) return result

        return {
          ...result,
          nextRunAt: result.nextRunAt?.toISOString() ?? null,
          message:
            `${result.created ? "Created" : "Updated"} the routine "${result.name}". It runs ${result.describes}` +
            `${result.nextRunAt ? `, next on ${result.nextRunAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}. ` +
            `It will say nothing on a quiet run.`,
        }
      },
    }),

    listRoutines: defineTool({
      description: "Everything that runs on a schedule, when it next runs, and how the last run went.",
      inputSchema: z.object({}),
      execute: async () => {
        const routines = await listRoutines()

        return {
          ok: true as const,
          count: routines.length,
          routines: routines.map((r) => ({
            ...r,
            nextRunAt: r.nextRunAt?.toISOString() ?? null,
            lastRunAt: r.lastRunAt?.toISOString() ?? null,
          })),
        }
      },
    }),

    stopRoutine: defineTool({
      description:
        "Stop a routine from running. Disables it rather than deleting it, so it can be turned back on without describing it again.",
      inputSchema: z.object({ slug: z.string().describe("The routine's slug, from listRoutines") }),
      execute: async ({ slug }) => {
        const result = await stopRoutine(slug)
        return result.ok
          ? { ok: true as const, message: `Stopped "${slug}". Turn it back on in Settings → Agents.` }
          : result
      },
    }),

    setReminder: defineTool({
      description:
        "Set a reminder for yourself or a team member. Creates a task with a due date that will surface in morning briefings and task lists.",
      inputSchema: z.object({
        reminderText: z.string().describe("What to be reminded about"),
        remindAt: z.string().describe("When to remind (ISO datetime or natural language like 'tomorrow 9am')"),
        assignTo: z.string().optional().describe("Optional: staff member name to assign to. Defaults to yourself."),
      }),
      execute: async ({ reminderText, remindAt }) => {
        let dueDate: Date
        try {
          dueDate = new Date(remindAt)
          if (isNaN(dueDate.getTime())) {
            // Handle relative dates
            const now = new Date()
            if (remindAt.toLowerCase().includes("tomorrow")) {
              dueDate = new Date(now.getTime() + 86400000)
            } else if (remindAt.toLowerCase().includes("next week")) {
              dueDate = new Date(now.getTime() + 7 * 86400000)
            } else if (remindAt.toLowerCase().includes("hour")) {
              const hours = parseInt(remindAt) || 1
              dueDate = new Date(now.getTime() + hours * 3600000)
            } else {
              dueDate = new Date(now.getTime() + 86400000) // Default to tomorrow
            }
          }
        } catch {
          dueDate = new Date(Date.now() + 86400000)
        }

        // The model is CrmTask: notes not description, dueAt not dueDate, and
        // its statuses are open/done/cancelled.
        const task = await db.crmTask.create({
          data: {
            title: `⏰ Reminder: ${reminderText}`,
            notes: `Auto-reminder set by the agent.\n\nOriginal request: "${reminderText}"\nScheduled for: ${dueDate.toISOString()}`,
            dueAt: dueDate,
            status: "open",
            priority: "normal",
            assignedToId: userId,
            createdByAgent: true,
          },
        })

        return {
          ok: true as const,
          taskId: task.id,
          reminderText,
          scheduledFor: dueDate.toISOString(),
          message: `Reminder set for ${dueDate.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`,
        }
      },
    }),

    createRecurringReport: defineTool({
      description:
        "Save a report's shape as a reusable skill. This does NOT schedule anything — use createRoutine for something that runs on its own.",
      inputSchema: z.object({
        reportName: z.string().describe("Human-friendly name for this report"),
        reportType: z.enum([
          "daily_snapshot", "weekly_sales", "monthly_finance",
          "inventory_alert", "customer_health", "pipeline_review",
        ]),
        schedule: z.enum(["daily", "weekly", "monthly"]),
        recipients: z.array(z.string()).describe("Who receives this: 'all_staff', 'sales_team', 'warehouse_team', 'management', or specific names"),
        customInstructions: z.string().optional().describe("Special instructions for report content"),
      }),
      execute: async ({ reportName, reportType, schedule, recipients, customInstructions }) => {
        // Store as an agent skill so the morning briefing or cron can pick it up
        await db.agentSkill.upsert({
          where: { slug: `report-${reportType}-${schedule}` },
          create: {
            slug: `report-${reportType}-${schedule}`,
            name: reportName,
            description: `Generate and deliver a ${schedule} ${reportType.replace(/_/g, " ")} report`,
            content: JSON.stringify({
              type: "recurring_report",
              reportType,
              schedule,
              recipients,
              customInstructions: customInstructions || null,
            }),
            version: 1,
          },
          update: {
            name: reportName,
            description: `Generate and deliver a ${schedule} ${reportType.replace(/_/g, " ")} report`,
            content: JSON.stringify({
              type: "recurring_report",
              reportType,
              schedule,
              recipients,
              customInstructions: customInstructions || null,
            }),
          },
        })

        return {
          ok: true as const,
          reportName,
          reportType,
          schedule,
          recipients,
          message: `Recurring ${schedule} report "${reportName}" has been configured. It will be included in ${schedule === "daily" ? "morning briefings" : `${schedule} summaries`}.`,
        }
      },
    }),

    createWorkflow: defineTool({
      description:
        "Define an automated workflow triggered by business events. The workflow describes what actions should be taken when specific events occur.",
      inputSchema: z.object({
        name: z.string().describe("Name for this workflow"),
        trigger: z.enum([
          "new_order", "low_stock", "overdue_invoice",
          "new_customer", "returned_item", "price_change",
          "expiring_batch", "large_order", "credit_limit_reached",
        ]),
        actions: z.array(z.string()).describe("List of actions to take when triggered"),
        notifyGroup: z.string().optional().describe("Group channel purpose to notify (e.g. 'operations', 'sales')"),
        isActive: z.boolean().default(true),
      }),
      execute: async ({ name, trigger, actions, notifyGroup, isActive }) => {
        await db.agentSkill.upsert({
          where: { slug: `workflow-${trigger}` },
          create: {
            slug: `workflow-${trigger}`,
            name,
            description: `Automated workflow: When ${trigger.replace(/_/g, " ")} occurs, execute defined actions`,
            content: JSON.stringify({
              type: "workflow",
              trigger,
              actions,
              notifyGroup: notifyGroup || null,
              isActive,
            }),
            version: 1,
          },
          update: {
            name,
            description: `Automated workflow: When ${trigger.replace(/_/g, " ")} occurs, execute defined actions`,
            content: JSON.stringify({
              type: "workflow",
              trigger,
              actions,
              notifyGroup: notifyGroup || null,
              isActive,
            }),
          },
        })

        return {
          ok: true as const,
          workflowName: name,
          trigger,
          actionCount: actions.length,
          actions,
          message: `Workflow "${name}" configured. Trigger: ${trigger.replace(/_/g, " ")}. ${actions.length} action(s) defined.`,
        }
      },
    }),

    translateText: defineTool({
      description:
        "Translate text between languages. Useful for communicating with international suppliers or customers.",
      inputSchema: z.object({
        text: z.string().describe("The text to translate"),
        targetLanguage: z.string().describe("Target language (e.g. 'Spanish', 'Mandarin', 'Japanese', 'French')"),
        sourceLanguage: z.string().optional().default("English").describe("Source language"),
      }),
      execute: async ({ text, targetLanguage, sourceLanguage }) => {
        // Use the AI model itself for translation via a structured approach
        try {
          const { runAgentTurn } = await import("../runtime")
          const subturn = await runAgentTurn({
            principal,
            channel: "internal_translate",
            threadKey: `translate:${Date.now()}`,
            userMessage: `Translate the following text from ${sourceLanguage} to ${targetLanguage}. Return ONLY the translated text, nothing else.\n\nText: "${text}"`,
            agentSlug: "ops",
          })

          return {
            ok: true as const,
            originalText: text,
            translatedText: subturn.text,
            from: sourceLanguage,
            to: targetLanguage,
          }
        } catch {
          return {
            ok: false as const,
            error: "Translation service unavailable. Please try again.",
          }
        }
      },
    }),

    generateQrCode: defineTool({
      description:
        "Generate a QR code URL for any text, URL, phone number, or data. Returns a URL to the rendered QR image.",
      inputSchema: z.object({
        data: z.string().describe("The data to encode in the QR code (URL, text, phone number, etc.)"),
        size: z.number().optional().default(300).describe("QR code size in pixels"),
        label: z.string().optional().describe("Optional label for the QR code"),
      }),
      execute: async ({ data, size, label }) => {
        const encodedData = encodeURIComponent(data)
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedData}`

        return {
          ok: true as const,
          qrCodeUrl: qrUrl,
          data,
          label: label || data.slice(0, 50),
          message: `QR code generated. View it at: ${qrUrl}`,
        }
      },
    }),

    summarizeThread: defineTool({
      description:
        "Generate a summary of the current conversation thread or look up a previous conversation's summary.",
      inputSchema: z.object({
        threadKey: z.string().optional().describe("Optional thread key to summarize. If omitted, summarizes the current conversation."),
      }),
      execute: async ({ threadKey }) => {
        const threads = threadKey
          ? await db.agentThread.findMany({
              where: { threadKey: { contains: threadKey } },
              include: { messages: { orderBy: { createdAt: "desc" }, take: 20, select: { role: true, content: true, createdAt: true } } },
              take: 1,
            })
          : await db.agentThread.findMany({
              where: { userId: userId || undefined },
              orderBy: { updatedAt: "desc" },
              include: { messages: { orderBy: { createdAt: "desc" }, take: 10, select: { role: true, content: true, createdAt: true } } },
              take: 1,
            })

        if (!threads.length) {
          return { ok: false as const, error: "No thread found to summarize" }
        }

        const thread = threads[0]
        const messageLog = thread.messages
          .reverse()
          .filter((m) => m.content)
          .map((m) => `[${m.role}]: ${m.content!.slice(0, 200)}`)
          .join("\n")

        return {
          ok: true as const,
          threadId: thread.id,
          threadKey: thread.threadKey,
          persona: thread.persona,
          status: thread.status,
          messageCount: thread.messages.length,
          existingSummary: thread.summary,
          recentMessages: messageLog,
          lastActivity: thread.lastMessageAt,
        }
      },
    }),

    createChecklist: defineTool({
      description:
        "Create a structured checklist or task list for operational workflows. Each item becomes a trackable task.",
      inputSchema: z.object({
        title: z.string().describe("Checklist title/name"),
        items: z.array(z.string()).min(1).max(20).describe("Checklist items (1-20 items)"),
        dueDate: z.string().optional().describe("Due date for the checklist (ISO date)"),
        priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      }),
      execute: async ({ title, items, dueDate, priority }) => {
        const parsedDue = dueDate ? new Date(dueDate) : null

        const createdTasks: Array<{ id: string; item: string }> = []
        for (let i = 0; i < items.length; i++) {
          const task = await db.crmTask.create({
            data: {
              title: `[${title}] ${i + 1}. ${items[i]}`,
              notes: `Checklist item ${i + 1} of ${items.length} for: ${title}`,
              dueAt: parsedDue,
              status: "open",
              // CrmTask uses low/normal/high; "medium" and "critical" are not
              // values it has.
              priority: priority === "medium" ? "normal" : priority === "critical" ? "high" : priority,
              assignedToId: userId,
              createdByAgent: true,
            },
          })
          createdTasks.push({ id: task.id, item: items[i] })
        }

        return {
          ok: true as const,
          checklistTitle: title,
          itemCount: items.length,
          tasks: createdTasks,
          dueDate: parsedDue?.toISOString() || null,
          message: `Checklist "${title}" created with ${items.length} items as trackable tasks.`,
        }
      },
    }),
  }
}
