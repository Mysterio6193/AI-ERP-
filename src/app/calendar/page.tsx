"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { dateKey, monthGrid, type CalendarEvent, type CalendarKind } from "@/lib/calendar"

/**
 * What is happening, on one screen.
 *
 * The dates a distributor runs on were spread across seven pages — routes,
 * orders, purchase orders, production, invoices, batch expiry, CRM tasks — so
 * answering "what does Thursday look like" meant opening all seven.
 */

const KIND_LABEL: Record<CalendarKind, string> = {
  delivery: "Delivery",
  order_due: "Order due",
  purchase_arriving: "Arriving",
  production: "Production",
  invoice_due: "Invoice due",
  batch_expiry: "Expiring",
  task: "Task",
}

/**
 * Colour carries the kind, so a day reads at a glance without being decoded.
 * Expiry and overdue money are the two that cost real money, so they are the
 * two that are loud.
 */
const KIND_STYLE: Record<CalendarKind, string> = {
  delivery: "bg-blue-50 text-blue-700 border-blue-200",
  order_due: "bg-indigo-50 text-indigo-700 border-indigo-200",
  purchase_arriving: "bg-slate-50 text-slate-700 border-slate-200",
  production: "bg-violet-50 text-violet-700 border-violet-200",
  invoice_due: "bg-amber-50 text-amber-800 border-amber-200",
  batch_expiry: "bg-rose-50 text-rose-700 border-rose-200",
  task: "bg-emerald-50 text-emerald-700 border-emerald-200",
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export default function CalendarPage() {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [byDate, setByDate] = useState<Record<string, CalendarEvent[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/calendar?year=${year}&month=${month}`)
      const payload = await response.json()

      if (payload.success) {
        setByDate(payload.data.byDate)
      } else {
        setError(payload.error || "Could not load the calendar.")
      }
    } catch {
      setError("Could not reach the server.")
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    void load()
  }, [load])

  const days = useMemo(() => monthGrid(year, month), [year, month])
  const todayKey = dateKey(today)
  const monthName = new Date(year, month, 1).toLocaleString(undefined, { month: "long", year: "numeric" })

  function step(by: number) {
    const next = new Date(year, month + by, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
    setSelected(null)
  }

  const selectedEvents = selected ? (byDate[selected] ?? []) : []
  const urgentCount = Object.values(byDate).flat().filter((e) => e.urgent).length

  return (
    <AppShell title="Calendar">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
            <p className="text-sm text-muted-foreground">
              Deliveries, orders, arrivals, production, invoices and expiry — on one screen.
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[9.5rem] text-center text-sm font-medium">{monthName}</span>
            <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setYear(today.getFullYear())
                setMonth(today.getMonth())
                setSelected(todayKey)
              }}
            >
              Today
            </Button>
          </div>
        </div>

        {error ? (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {urgentCount > 0 ? (
          <p className="text-sm text-rose-700">
            {urgentCount} item{urgentCount === 1 ? "" : "s"} this month need attention — expiring stock or money already overdue.
          </p>
        ) : null}

        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
              {WEEKDAYS.map((day) => (
                <div key={day} className="px-2 py-2 text-center">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = dateKey(day)
                const events = byDate[key] ?? []
                const outside = day.getMonth() !== month
                const isToday = key === todayKey

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(key)}
                    aria-label={`${day.toDateString()}, ${events.length} event${events.length === 1 ? "" : "s"}`}
                    aria-pressed={selected === key}
                    className={[
                      "min-h-[6.5rem] border-b border-r p-1.5 text-left align-top transition-colors",
                      outside ? "bg-muted/30 text-muted-foreground" : "hover:bg-muted/50",
                      selected === key ? "ring-2 ring-inset ring-primary" : "",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                        isToday ? "bg-primary font-semibold text-primary-foreground" : "",
                      ].join(" ")}
                    >
                      {day.getDate()}
                    </span>

                    <span className="mt-1 flex flex-col gap-0.5">
                      {events.slice(0, 3).map((item) => (
                        <span
                          key={item.id}
                          className={`truncate rounded border px-1 py-0.5 text-[11px] leading-tight ${KIND_STYLE[item.kind]}`}
                          title={`${KIND_LABEL[item.kind]}: ${item.title}`}
                        >
                          {item.title}
                        </span>
                      ))}
                      {events.length > 3 ? (
                        <span className="px-1 text-[11px] text-muted-foreground">
                          +{events.length - 3} more
                        </span>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}

        {selected ? (
          <Card>
            <CardHeader>
              <CardTitle as="h2" className="text-base">
                {new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </CardTitle>
              <CardDescription>
                {selectedEvents.length
                  ? `${selectedEvents.length} item${selectedEvents.length === 1 ? "" : "s"}`
                  : "Nothing scheduled."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {selectedEvents.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {item.title}
                      {item.urgent ? <span className="ml-2 text-xs text-rose-700">needs attention</span> : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {KIND_LABEL[item.kind]}
                      {item.detail ? ` · ${item.detail}` : ""}
                      {item.status ? ` · ${item.status}` : ""}
                    </p>
                  </div>
                  {item.href ? (
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={item.href}>Open</Link>
                    </Button>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </AppShell>
  )
}
