"use client"

import { useEffect, useState } from "react"

type Status = "checking" | "running" | "down"

/**
 * A live pill on the launcher's OpenBot card.
 *
 * The probe runs from the browser after paint rather than during the server
 * render, so a stopped OpenBot costs the launcher nothing: the page is on
 * screen before anyone waits on a port that may not answer.
 */
export function OpenbotStatus() {
  const [status, setStatus] = useState<Status>("checking")

  useEffect(() => {
    let cancelled = false

    async function probe() {
      try {
        const response = await fetch("/api/openbot/status", { cache: "no-store" })
        const payload = await response.json()
        if (!cancelled) setStatus(payload?.data?.running ? "running" : "down")
      } catch {
        if (!cancelled) setStatus("down")
      }
    }

    void probe()
    return () => {
      cancelled = true
    }
  }, [])

  const label =
    status === "checking" ? "Checking…" : status === "running" ? "Running" : "Not running"

  const dot =
    status === "checking"
      ? "bg-neutral-300"
      : status === "running"
        ? "bg-emerald-500"
        : "bg-amber-500"

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}
