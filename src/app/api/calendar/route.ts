import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { calendarEvents, groupByDate } from "@/lib/calendar"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

/** Everything the business has scheduled in a date range, from seven tables. */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.operations)
  if (!auth.user) return auth.response

  const { searchParams } = new URL(request.url)

  const now = new Date()
  const year = Number(searchParams.get("year")) || now.getFullYear()
  const month = searchParams.get("month") !== null ? Number(searchParams.get("month")) : now.getMonth()

  if (!Number.isInteger(year) || month < 0 || month > 11) {
    return NextResponse.json({ success: false, error: "Invalid year or month." }, { status: 400 })
  }

  // A whole month plus the padding weeks either side, so the grid's leading
  // and trailing days are not blank when they have events.
  const from = new Date(year, month, -6, 0, 0, 0)
  const to = new Date(year, month + 1, 7, 23, 59, 59)

  const events = await calendarEvents(db, { from, to })

  return NextResponse.json({
    success: true,
    data: {
      year,
      month,
      events,
      byDate: groupByDate(events),
      summary: {
        total: events.length,
        urgent: events.filter((e) => e.urgent).length,
      },
    },
  })
}
