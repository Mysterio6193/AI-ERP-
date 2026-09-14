import { useCallback, useEffect, useState } from "react"

import { client, readCachedRun, writeCachedRun } from "@/lib/runtime"

export interface Stop {
  id: string
  customerName: string
  address: string
  status: string
}

/**
 * Today's stops.
 *
 * Falls back to the last run that was successfully fetched rather than showing
 * an error, and says so. A driver in a basement still needs the address of the
 * next drop; an empty screen with a retry button is useless there.
 */
export function useRun() {
  const [stops, setStops] = useState<Stop[]>([])
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await client.todaysRoute()
      const fresh: Stop[] = (data?.stops ?? []).map((stop: Record<string, unknown>) => ({
        id: String(stop.id),
        customerName: String(stop.customerName ?? stop.customer ?? "Customer"),
        address: String(stop.address ?? ""),
        status: String(stop.status ?? "pending"),
      }))

      setStops(fresh)
      setOffline(false)
      await writeCachedRun(fresh)
    } catch {
      const cached = await readCachedRun()
      setStops(cached)
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { stops, loading, offline, refresh }
}
