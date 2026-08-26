import { NextRequest, NextResponse } from "next/server"

import { buildIcsFeed, type CalendarEvent } from "@/lib/calendar/ics"
import { db } from "@/lib/db"

/**
 * A staff member's operations calendar, as a subscribable feed.
 *
 * No session: a calendar app cannot send an Authorization header, so the token
 * in the path is the credential — the same design as Google's own "secret
 * address in iCal format". That makes the URL itself sensitive, which is why it
 * is long, random, and regenerable.
 *
 * This is also the answer to connecting a calendar without registering an
 * application with Google or Microsoft. The user subscribes in their own client
 * in a few seconds and we hold nothing on their behalf.
 */

/** How far ahead to publish. Far enough to plan, not so far the feed is huge. */
const HORIZON_DAYS = 90
/** A little history, so this morning's delivery does not vanish at noon. */
const LOOKBACK_DAYS = 7

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  // Length-checked before the lookup so a short guess cannot probe the table.
  if (!token || token.length < 24) {
    return new NextResponse("Not found", { status: 404 })
  }

  const user = await db.user.findUnique({
    where: { calendarFeedToken: token },
    select: { id: true, name: true },
  })

  if (!user) {
    // Deliberately identical to a malformed token: telling the difference
    // confirms which tokens exist.
    return new NextResponse("Not found", { status: 404 })
  }

  const now = new Date()
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86400000)
  const to = new Date(now.getTime() + HORIZON_DAYS * 86400000)

  const [deliveries, tasks] = await Promise.all([
    db.delivery.findMany({
      where: { scheduledDate: { gte: from, lte: to } },
      select: {
        id: true,
        deliveryNumber: true,
        scheduledDate: true,
        scheduledTime: true,
        status: true,
        updatedAt: true,
        customer: { select: { name: true } },
      },
      orderBy: { scheduledDate: "asc" },
      take: 500,
    }),
    db.crmTask.findMany({
      where: { assignedToId: user.id, dueAt: { gte: from, lte: to } },
      select: { id: true, title: true, type: true, dueAt: true, notes: true, updatedAt: true },
      orderBy: { dueAt: "asc" },
      take: 500,
    }),
  ])

  const events: CalendarEvent[] = []

  for (const delivery of deliveries) {
    events.push({
      uid: `delivery-${delivery.id}@supplysure`,
      start: delivery.scheduledDate,
      // Scheduled dates carry no time of day, so these show as all-day entries
      // rather than pretending to a precision the data does not have.
      allDay: true,
      summary: `Delivery ${delivery.deliveryNumber} — ${delivery.customer?.name ?? "Customer"}`,
      description: [
        delivery.scheduledTime ? `Window: ${delivery.scheduledTime}` : null,
        `Status: ${delivery.status}`,
      ]
        .filter(Boolean)
        .join("\n"),
      // A cancelled delivery is greyed out rather than removed, or the old
      // entry simply stays in the driver's calendar for ever.
      status: delivery.status === "failed" || delivery.status === "returned" ? "CANCELLED" : "CONFIRMED",
      updatedAt: delivery.updatedAt,
    })
  }

  for (const task of tasks) {
    if (!task.dueAt) continue

    events.push({
      uid: `task-${task.id}@supplysure`,
      start: task.dueAt,
      summary: `${task.type.replace(/_/g, " ")}: ${task.title}`,
      description: task.notes ?? undefined,
      status: "CONFIRMED",
      updatedAt: task.updatedAt,
    })
  }

  const ics = buildIcsFeed({ name: `SupplySure — ${user.name}`, events, now })

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="supplysure.ics"',
      // Never cached by anything in between: a stale delivery schedule is
      // worse than a slow one, and the URL is a secret.
      "Cache-Control": "private, no-store, max-age=0",
    },
  })
}
