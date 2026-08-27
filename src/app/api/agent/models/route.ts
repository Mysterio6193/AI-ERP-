import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"

/**
 * What the provider actually serves right now.
 *
 * The model pickers carried hand-written lists, and both went stale: a Nemotron
 * vision model was retired upstream and Claude 3.5 Sonnet was renamed, so
 * choosing either produced a 404 at request time rather than at selection —
 * which reads as the agent being broken rather than the model being gone.
 *
 * Asking the provider costs one cached call and cannot drift.
 */

interface CachedList {
  at: number
  models: ModelOption[]
}

export interface ModelOption {
  id: string
  label: string
  free: boolean
  vision: boolean
  contextLength: number | null
}

/** Long enough that a page of pickers is one call; short enough to notice a change. */
const TTL_MS = 10 * 60 * 1000
let cache: CachedList | null = null

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) return auth.response

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ success: true, data: { models: cache.models, cached: true } })
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`)

    const payload = await response.json()
    const rows: unknown[] = Array.isArray(payload?.data) ? payload.data : []

    const models: ModelOption[] = rows
      .map((row) => row as Record<string, never>)
      .filter((row) => {
        // Only models that can call tools. The agent is useless without it, and
        // offering one that cannot is offering a broken choice.
        const params: string[] = (row.supported_parameters as unknown as string[]) ?? []
        return Array.isArray(params) && params.includes("tools")
      })
      .map((row) => {
        const pricing = (row.pricing ?? {}) as Record<string, string>
        const architecture = (row.architecture ?? {}) as Record<string, string[]>
        const free = pricing.prompt === "0" && pricing.completion === "0"

        return {
          id: String(row.id),
          label: String(row.name ?? row.id),
          free,
          vision: (architecture.input_modalities ?? []).includes("image"),
          contextLength: typeof row.context_length === "number" ? row.context_length : null,
        }
      })
      .sort((a, b) => Number(b.free) - Number(a.free) || a.label.localeCompare(b.label))

    cache = { at: Date.now(), models }

    return NextResponse.json({ success: true, data: { models, cached: false } })
  } catch (error) {
    // A picker that cannot reach the provider should still open. Saying the
    // list may be out of date is better than an empty dropdown.
    console.error("Could not list models:", error)

    return NextResponse.json({
      success: true,
      data: {
        models: [],
        cached: false,
        warning: "Could not reach the provider, so this list may be incomplete. You can still type a model id.",
      },
    })
  }
}
