import { z } from "zod"

import { db } from "@/lib/db"
import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"
import { isStaff } from "./shared"

/**
 * Calendar, Meeting Scheduling & Event Management.
 *
 * Hermes-grade calendar: Schedule meetings with clients/vendors, generate
 * iCal (.ics) invites, and view team schedules.
 */

function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z"
}

export function buildCalendarTools(principal: AgentPrincipal) {
  if (!isStaff(principal)) {
    return {}
  }

  const userId = principal.kind === "staff" ? principal.userId : null

  return {
    scheduleMeeting: defineTool({
      description:
        "Schedule a meeting or calendar appointment with a customer, supplier, or team member. Generates a standard iCal (.ics) invite payload.",
      inputSchema: z.object({
        title: z.string().describe("Meeting title (e.g. 'Quarterly Review with IGA Distribution')"),
        description: z.string().optional().describe("Meeting agenda or notes"),
        startTime: z.string().describe("Start time (ISO datetime or natural language like 'tomorrow at 2pm')"),
        durationMinutes: z.number().optional().default(30).describe("Meeting duration in minutes"),
        attendees: z.array(z.string()).optional().describe("List of attendee names or email addresses"),
        location: z.string().optional().default("Google Meet / Video Call").describe("Location or video link"),
      }),
      execute: async ({ title, description, startTime, durationMinutes, attendees, location }) => {
        let start: Date
        try {
          start = new Date(startTime)
          if (isNaN(start.getTime())) {
            // Natural date fallback
            const now = new Date()
            if (startTime.toLowerCase().includes("tomorrow")) {
              start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 14, 0)
            } else {
              start = new Date(now.getTime() + 86400000)
            }
          }
        } catch {
          start = new Date(Date.now() + 86400000)
        }

        const end = new Date(start.getTime() + durationMinutes * 60000)
        const now = new Date()

        // Create a corresponding database Task so it's tracked in SupplySure OS
        // The model is CrmTask; its body is `notes` and its due column is
        // `dueAt`. A `type` is required.
        const task = await db.crmTask.create({
          data: {
            title: `📅 Meeting: ${title}`,
            notes: `${description || "Scheduled meeting"}\n\nLocation: ${location}\nAttendees: ${attendees?.join(", ") || "N/A"}\nDuration: ${durationMinutes} mins`,
            type: "meeting",
            dueAt: start,
            status: "pending",
            priority: "high",
            assignedToId: userId,
          },
        })

        // Generate RFC 5545 iCalendar content
        const uid = `event-${task.id}@supplysure.io`
        const icsContent = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//SupplySure OS//AI Assistant//EN",
          "CALSCALE:GREGORIAN",
          "METHOD:REQUEST",
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTAMP:${formatIcsDate(now)}`,
          `DTSTART:${formatIcsDate(start)}`,
          `DTEND:${formatIcsDate(end)}`,
          `SUMMARY:${title}`,
          `DESCRIPTION:${(description || "").replace(/\n/g, "\\n")}`,
          `LOCATION:${location}`,
          `STATUS:CONFIRMED`,
          attendees?.length ? attendees.map((a) => `ATTENDEE;CN=${a}:mailto:${a}`).join("\n") : "",
          "END:VEVENT",
          "END:VCALENDAR",
        ].filter(Boolean).join("\r\n")

        return {
          ok: true as const,
          eventId: task.id,
          title,
          start: start.toISOString(),
          end: end.toISOString(),
          durationMinutes,
          location,
          attendees: attendees || [],
          icsPayload: icsContent,
          message: `Meeting "${title}" scheduled for ${start.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} (${durationMinutes} min).`,
        }
      },
    }),

    listUpcomingEvents: defineTool({
      description:
        "List all upcoming meetings, calendar appointments, and scheduled delivery routes for the next 7 days.",
      inputSchema: z.object({
        daysAhead: z.number().optional().default(7).describe("Number of days ahead to search"),
      }),
      execute: async ({ daysAhead }) => {
        const now = new Date()
        const end = new Date(now.getTime() + daysAhead * 86400000)

        const [tasks, routes] = await Promise.all([
          db.crmTask.findMany({
            where: {
              dueAt: { gte: now, lte: end },
              status: { not: "completed" },
            },
            orderBy: { dueAt: "asc" },
            // No relation from CrmTask to User; names resolved below.
          }),
          db.deliveryRoute.findMany({
            where: {
              routeDate: { gte: now, lte: end },
            },
            orderBy: { routeDate: "asc" },
            include: { driver: { select: { name: true } }, deliveries: true },
          }),
        ])

        // CrmTask carries assignedToId but has no relation back to User, so
        // the names are resolved in one query rather than joined per row.
        const assignees = await db.user.findMany({
          where: { id: { in: tasks.map((t) => t.assignedToId).filter(Boolean) as string[] } },
          select: { id: true, name: true },
        })
        const assigneeNames = new Map(assignees.map((u) => [u.id, u.name]))

        return {
          ok: true as const,
          timeRange: `Next ${daysAhead} days`,
          scheduledTasksAndMeetings: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            due: t.dueAt?.toISOString(),
            priority: t.priority,
            assignedTo: (t.assignedToId && assigneeNames.get(t.assignedToId)) || "Unassigned",
          })),
          scheduledDeliveryRoutes: routes.map((r) => ({
            id: r.id,
            routeNumber: r.routeNumber,
            name: r.name,
            date: r.routeDate.toISOString().split("T")[0],
            driver: r.driver?.name || "Unassigned",
            stops: r.deliveries.length,
          })),
        }
      },
    }),
  }
}
