import { useCallback, useEffect, useState } from "react"

import { ActionQueue } from "@/lib/queue"
import { queue } from "@/lib/runtime"

/**
 * The queue, as the UI sees it.
 *
 * Exposes the counts rather than the actions, because what a driver needs from
 * the top of the screen is "is my work safe" — the detail belongs on a review
 * screen they open deliberately.
 */
export function useQueue(instance: ActionQueue = queue) {
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)

  const refresh = useCallback(async () => {
    await instance.load()
    setPending(instance.pendingCount())
    setFailed(instance.failed().length)
  }, [instance])

  const flush = useCallback(async () => {
    await instance.flush()
    await refresh()
  }, [instance, refresh])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { pending, failed, flush, refresh }
}
