"use client"

import { useEffect, useState } from "react"

import { DEFAULT_IDENTITY } from "./identity-shared"

/**
 * The agent's name, for client components.
 *
 * Cached in module scope because the sidebar renders on every page and the
 * name changes roughly never — one fetch per session, not per navigation.
 * Falls back to the neutral default so a failed request shows a sane label
 * rather than an empty space where a name should be.
 */

interface PublicIdentity {
  name: string
  email: string
  signature: string
  disclosure: string
}

let cached: PublicIdentity | null = null
let inflight: Promise<PublicIdentity | null> | null = null

async function load(): Promise<PublicIdentity | null> {
  if (cached) return cached
  if (inflight) return inflight

  inflight = fetch("/api/agent/identity")
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      if (!payload?.success) return null
      cached = payload.data.identity as PublicIdentity
      return cached
    })
    .catch(() => null)
    .finally(() => {
      inflight = null
    })

  return inflight
}

/** Clears the cache after the identity is edited, so the UI updates at once. */
export function clearAgentIdentityCache() {
  cached = null
}

export function useAgentIdentity() {
  // Always the default on first render, never the cache. Seeding from a
  // module-scoped cache means a client-side navigation renders "Friday" while
  // the server rendered "SupplySure Assistant", which is a hydration mismatch
  // that takes the whole tree down.
  const [identity, setIdentity] = useState<PublicIdentity>({
    name: DEFAULT_IDENTITY.name,
    email: DEFAULT_IDENTITY.email,
    signature: DEFAULT_IDENTITY.signature,
    disclosure: DEFAULT_IDENTITY.disclosure,
  })

  useEffect(() => {
    let cancelled = false

    void load().then((next) => {
      if (next && !cancelled) setIdentity(next)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return identity
}
