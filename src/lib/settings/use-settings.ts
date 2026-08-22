"use client"

import { useEffect, useState } from "react"

import { defaultsFor, type Namespace, type SettingsOf } from "./registry"

/**
 * Read a settings namespace from a client component.
 *
 * Starts from the compiled-in defaults and swaps in the saved values once they
 * arrive, so a screen renders correct-by-default rather than empty, and a
 * failed fetch degrades to today's behaviour instead of a blank panel. That
 * property is the whole reason the defaults have to reproduce current
 * behaviour exactly.
 */
export function useSettings<K extends Namespace>(namespace: K) {
  const [settings, setSettings] = useState<SettingsOf<K>>(() => defaultsFor(namespace))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/settings/${namespace}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.success) {
          return
        }
        setSettings(payload.data.settings as SettingsOf<K>)
      })
      .catch(() => {
        // Keep the defaults. An aging panel showing the standard buckets beats
        // one showing nothing because a settings request failed.
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [namespace])

  return { settings, loading }
}
