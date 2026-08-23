import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { gateway, type LanguageModel } from "ai"

/**
 * Provider-agnostic model resolution.
 *
 * Supported modes, chosen by AGENT_PROVIDER (or inferred from which keys exist):
 *   google      - Direct Google AI Studio / Gemini API (free tier, fast, multimodal)
 *   openrouter  - OpenRouter multi-model gateway
 *   local       - any OpenAI-compatible server: Ollama, LM Studio, llama.cpp, vLLM
 *   gateway     - Vercel AI Gateway
 */

export type AgentProviderMode = "gateway" | "local" | "openrouter" | "google"

export type ModelTier = "chat" | "fast"

const DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-5"
const DEFAULT_GATEWAY_FAST_MODEL = "anthropic/claude-haiku-4.5"
const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1"
const DEFAULT_LOCAL_MODEL = "llama3.1"
const DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
const DEFAULT_OPENROUTER_MODEL = "stealth/ox-alpha"
const DEFAULT_OPENROUTER_FAST_MODEL = "stealth/ox-alpha"
const DEFAULT_GOOGLE_MODEL = "gemini-3.1-flash-lite"
const DEFAULT_GOOGLE_FAST_MODEL = "gemini-3.1-flash-lite"

function env(name: string) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

export function getProviderMode(): AgentProviderMode {
  const explicit = env("AGENT_PROVIDER")?.toLowerCase()
  if (explicit === "google" || explicit === "gateway" || explicit === "local" || explicit === "openrouter") {
    return explicit
  }

  if (env("GEMINI_API_KEY") || env("GOOGLE_GENERATIVE_AI_API_KEY")) {
    return "google"
  }

  if (env("OPENROUTER_API_KEY")) {
    return "openrouter"
  }

  // auto
  if (env("AI_GATEWAY_API_KEY") || env("VERCEL_OIDC_TOKEN")) {
    return "gateway"
  }

  return env("AGENT_LOCAL_BASE_URL") ? "local" : "gateway"
}

function googleProvider() {
  return createGoogleGenerativeAI({
    apiKey: env("GEMINI_API_KEY") || env("GOOGLE_GENERATIVE_AI_API_KEY") || "",
  })
}

export function getLocalBaseUrl() {
  return env("AGENT_LOCAL_BASE_URL") || DEFAULT_LOCAL_BASE_URL
}

function localProvider() {
  return createOpenAICompatible({
    name: "local",
    baseURL: getLocalBaseUrl(),
    // Ollama ignores the key; LM Studio and vLLM accept anything.
    apiKey: env("AGENT_LOCAL_API_KEY") || "local",
  })
}

function openrouterProvider() {
  return createOpenAICompatible({
    name: "openrouter",
    baseURL: env("OPENROUTER_BASE_URL") || DEFAULT_OPENROUTER_BASE_URL,
    apiKey: env("OPENROUTER_API_KEY") || env("AGENT_LOCAL_API_KEY") || "",
    headers: {
      "HTTP-Referer": "https://supplysure.os",
      "X-Title": "SupplySure OS",
    },
    fetch: async (url, options) => {
      let originalModel = ""
      if (options?.body && typeof options.body === "string") {
        try {
          const parsed = JSON.parse(options.body)
          originalModel = parsed.model || ""
        } catch {
          // ignore JSON parse errors
        }
      }

      let response = await fetch(url, options)

      // Graceful fallback if a :free model hits upstream rate-limits or errors
      if ((response.status === 429 || response.status >= 500) && originalModel.includes(":free") && options?.body && typeof options.body === "string") {
        try {
          const parsed = JSON.parse(options.body)
          // 1. First try stripping :free tag
          parsed.model = originalModel.replace(":free", "")
          let fallbackResponse = await fetch(url, {
            ...options,
            body: JSON.stringify(parsed),
          })
          if (fallbackResponse.ok) {
            return fallbackResponse
          }

          // 2. Fallback to ultra-fast resilient model
          parsed.model = "google/gemini-2.5-flash"
          fallbackResponse = await fetch(url, {
            ...options,
            body: JSON.stringify(parsed),
          })
          if (fallbackResponse.ok) {
            return fallbackResponse
          }
        } catch {
          // keep original response
        }
      }

      return response
    },
  })
}

export type AgentPurpose =
  | "chat"
  | "fast"
  | "telegram"
  | "ocr"
  | "voice"
  | "replenishment"
  | "triage"
  | "email"
  | "finance"
  | "customer"
  | "operations"
  | "summarise"

export interface ResolveModelOptions {
  model?: string | null
  purpose?: AgentPurpose | string
  tier?: ModelTier
}

export function getModelId(target?: ModelTier | string | ResolveModelOptions): string {
  if (typeof target === "string" && target.includes("/")) {
    return target
  }

  const options: ResolveModelOptions =
    typeof target === "string"
      ? target === "fast" || target === "chat"
        ? { tier: target }
        : { purpose: target }
      : target || { tier: "chat" }

  const mode = getProviderMode()

  // 1. Explicit model override (per agent definition or call site)
  if (options.model && options.model.trim()) {
    return options.model.trim()
  }

  // 2. Purpose-specific environment overrides
  if (options.purpose) {
    const purposeNormalized = options.purpose.toLowerCase().replace(/-/g, "_")
    const purposeKey = `AGENT_MODEL_${purposeNormalized.toUpperCase()}`
    const purposeEnv = env(purposeKey)
    if (purposeEnv) return purposeEnv

    if (options.purpose === "telegram") {
      const telegramEnv = env("AGENT_TELEGRAM_MODEL") || env("AGENT_MODEL_TELEGRAM")
      if (telegramEnv) return telegramEnv
    }

    if (options.purpose === "ocr") {
      const ocrEnv = env("AGENT_OCR_MODEL") || env("AGENT_MODEL_OCR")
      if (ocrEnv) return ocrEnv
      if (mode === "openrouter") return "google/gemini-2.5-flash"
    }

    if (options.purpose === "voice") {
      const voiceEnv = env("AGENT_VOICE_MODEL") || env("AGENT_MODEL_VOICE")
      if (voiceEnv) return voiceEnv
      if (mode === "openrouter") return "openai/whisper-large-v3"
    }
  }

  // 3. Mode-specific defaults and tier overrides
  if (mode === "google") {
    if (
      options.tier === "fast" ||
      options.purpose === "triage" ||
      options.purpose === "fast" ||
      options.purpose === "summarise"
    ) {
      return env("AGENT_FAST_MODEL") || env("AGENT_MODEL_FAST") || DEFAULT_GOOGLE_FAST_MODEL
    }
    return env("AGENT_MODEL") || env("AGENT_MODEL_CHAT") || DEFAULT_GOOGLE_MODEL
  }

  if (mode === "openrouter") {
    if (
      options.tier === "fast" ||
      options.purpose === "triage" ||
      options.purpose === "fast" ||
      options.purpose === "summarise"
    ) {
      return env("AGENT_FAST_MODEL") || env("AGENT_MODEL_FAST") || DEFAULT_OPENROUTER_FAST_MODEL
    }
    return env("AGENT_MODEL") || env("AGENT_MODEL_CHAT") || DEFAULT_OPENROUTER_MODEL
  }

  if (mode === "local") {
    if (
      options.tier === "fast" ||
      options.purpose === "triage" ||
      options.purpose === "fast" ||
      options.purpose === "summarise"
    ) {
      return env("AGENT_LOCAL_FAST_MODEL") || DEFAULT_LOCAL_MODEL
    }
    return env("AGENT_LOCAL_MODEL") || DEFAULT_LOCAL_MODEL
  }

  // gateway
  if (
    options.tier === "fast" ||
    options.purpose === "triage" ||
    options.purpose === "fast" ||
    options.purpose === "summarise"
  ) {
    return env("AGENT_FAST_MODEL") || DEFAULT_GATEWAY_FAST_MODEL
  }
  return env("AGENT_MODEL") || DEFAULT_GATEWAY_MODEL
}

export function resolveAgentModel(target?: ModelTier | string | ResolveModelOptions): LanguageModel {
  const modelId = getModelId(target)
  const mode = getProviderMode()

  if (mode === "google") {
    return googleProvider()(modelId)
  }

  if (mode === "openrouter") {
    return openrouterProvider()(modelId)
  }

  if (mode === "local") {
    return localProvider()(modelId)
  }

  return gateway(modelId)
}

export function getAgentRuntimeInfo() {
  const mode = getProviderMode()

  return {
    mode,
    model: getModelId("chat"),
    fastModel: getModelId("fast"),
    telegramModel: getModelId({ purpose: "telegram" }),
    ocrModel: getModelId({ purpose: "ocr" }),
    voiceModel: getModelId({ purpose: "voice" }),
    replenishmentModel: getModelId({ purpose: "replenishment" }),
    emailModel: getModelId({ purpose: "email" }),
    financeModel: getModelId({ purpose: "finance" }),
    baseUrl:
      mode === "google"
        ? "https://generativelanguage.googleapis.com"
        : mode === "openrouter"
        ? env("OPENROUTER_BASE_URL") || DEFAULT_OPENROUTER_BASE_URL
        : mode === "local"
        ? getLocalBaseUrl()
        : "https://ai-gateway.vercel.sh/v1",
    configured:
      mode === "google"
        ? Boolean(env("GEMINI_API_KEY") || env("GOOGLE_GENERATIVE_AI_API_KEY"))
        : mode === "openrouter"
        ? Boolean(env("OPENROUTER_API_KEY"))
        : mode === "local" || Boolean(env("AI_GATEWAY_API_KEY") || env("VERCEL_OIDC_TOKEN")),
  }
}

/** Lists models the configured local runtime actually has pulled, for the settings UI. */
export async function listLocalModels(): Promise<string[]> {
  const baseUrl = getLocalBaseUrl().replace(/\/v1\/?$/, "")

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok) {
      return []
    }

    const payload = (await response.json()) as { data?: Array<{ id?: string }> }
    return (payload.data || []).map((entry) => String(entry.id || "")).filter(Boolean)
  } catch {
    return []
  }
}
