import type { AgentProviderMode } from "@/lib/agent/model"

/**
 * Turning the AI Models settings into model resolution overrides.
 *
 * The settings existed, were editable and appeared in the UI — and nothing
 * read them. Model choice came entirely from environment variables, so an
 * admin could pick a provider and eight per-purpose models and change nothing
 * at all. Worse, the provider list could not express "google" while the code
 * has supported Gemini all along, so the one option a Gemini deployment needs
 * was not offered.
 *
 * The precedence rule is the whole of the design, and it runs one way:
 *
 *     explicit call argument  >  settings  >  environment  >  built-in default
 *
 * with "unset" meaning "defer to the next one down". That distinction is load
 * bearing. Saving the settings form writes every field, so if an empty setting
 * counted as an opinion, opening the page once and pressing save would
 * override a working deployment's environment with blanks.
 */

export interface ModelSettings {
  provider: "environment" | "google" | "openrouter" | "gateway" | "local"
  chatModel: string
  telegramModel: string
  ocrModel: string
  voiceModel: string
  replenishmentModel: string
  emailModel: string
  financeModel: string
  fastModel: string
  localBaseUrl: string
}

export interface ModelOverrides {
  /** Undefined means the environment decides. */
  provider?: AgentProviderMode
  /** Model id for the purpose asked for, when settings name one. */
  model?: string
  /** Base URL for a self-hosted server, when settings name one. */
  localBaseUrl?: string
}

/** Blank and whitespace both mean "not set". */
function value(raw: string | undefined | null): string | undefined {
  const trimmed = (raw ?? "").trim()
  return trimmed ? trimmed : undefined
}

/**
 * Maps a purpose to the settings field naming its model.
 *
 * Purposes not listed fall through to the chat model, which is the right
 * default: a new purpose should work with the general model rather than fail
 * because nobody added a field for it.
 */
const FIELD_BY_PURPOSE: Record<string, keyof ModelSettings> = {
  chat: "chatModel",
  telegram: "telegramModel",
  ocr: "ocrModel",
  voice: "voiceModel",
  replenishment: "replenishmentModel",
  email: "emailModel",
  finance: "financeModel",
  fast: "fastModel",
}

/**
 * The overrides settings contribute for one purpose.
 *
 * `purpose` is matched loosely — an agent slug like "finance-bot" should pick
 * up the finance model without every slug being enumerated.
 */
export function overridesFor(
  settings: Partial<ModelSettings> | null | undefined,
  purpose?: string | null,
  tier?: "chat" | "fast"
): ModelOverrides {
  if (!settings) return {}

  const overrides: ModelOverrides = {}

  const provider = value(settings.provider)
  if (provider && provider !== "environment") {
    overrides.provider = provider as AgentProviderMode
  }

  const localBaseUrl = value(settings.localBaseUrl)
  if (localBaseUrl) overrides.localBaseUrl = localBaseUrl

  const key = (purpose ?? "").toLowerCase()

  // Exact purpose first, then a slug containing a known purpose, then the
  // tier, then the general chat model.
  let field: keyof ModelSettings | undefined = FIELD_BY_PURPOSE[key]

  if (!field && key) {
    const matched = Object.keys(FIELD_BY_PURPOSE).find((name) => key.includes(name))
    if (matched) field = FIELD_BY_PURPOSE[matched]
  }

  if (!field) field = tier === "fast" ? "fastModel" : "chatModel"

  const model = value(settings[field] as string | undefined)
  if (model) overrides.model = model

  return overrides
}

/**
 * Model overrides from the saved settings, for a given purpose.
 *
 * Kept apart from `overridesFor` so the precedence logic stays pure and
 * testable while this side does the database read. Failures degrade to no
 * overrides rather than throwing: a settings table that cannot be read should
 * leave the agent running on its environment, not take it down.
 */
export async function settingsOverrides(
  purpose?: string | null,
  tier?: "chat" | "fast",
  companyId?: string | null
): Promise<ModelOverrides> {
  try {
    const { getSettings } = await import("@/lib/settings/service")
    const settings = await getSettings("aiModels", { companyId: companyId ?? null })
    return overridesFor(settings as Partial<ModelSettings>, purpose, tier)
  } catch (error) {
    console.error("Could not read AI model settings; using the environment:", error)
    return {}
  }
}
