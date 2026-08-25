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
import {
  MAX_ATTEMPTS,
  classifyMessage,
  classifyResponse,
  computeBackoff,
  describeFailure,
  retryAfterMs,
  type Classification,
} from "@/lib/agent/retry"

const DEFAULT_OPENROUTER_MODEL = "nvidia/nemotron-3-super-120b-a12b"
const DEFAULT_OPENROUTER_FAST_MODEL = "nvidia/nemotron-3.5-lightning"
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
      /**
       * Retry the failures that clear on their own, and only those.
       *
       * What was here forced `max_tokens: 256` onto every request. That cap
       * arrived as an unmentioned side effect of a Telegram commit and was
       * applied at the provider, so it truncated every reply on every surface
       * — web chat, voice, scheduled agents — not just Telegram. A tool-calling
       * agent cut off at 256 output tokens can stop mid-call, which is how a
       * tool call ends up with no result. It is also the wrong lever for cost:
       * `max_tokens` bounds the reply, and it is the 88 tool definitions in the
       * prompt that make these requests expensive.
       */
      const model = readModelId(options)
      let lastReason: Classification["reason"] = "unknown"

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let response: Response

        try {
          response = await fetch(url, options)
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error)
          const verdict = classifyMessage(text)
          lastReason = verdict.reason

          // A thrown fetch has no response to hand back, so a terminal one has
          // to keep throwing rather than returning something the SDK will
          // misread as a reply.
          if (!verdict.transient || attempt === MAX_ATTEMPTS - 1) throw error

          await sleep(computeBackoff(attempt))
          continue
        }

        if (response.ok) return response

        // Reading the body consumes it, so it is only read on the failure
        // path where the response is not being returned to the caller.
        const body = await response.clone().text().catch(() => "")
        const verdict = classifyResponse(response.status, body)
        lastReason = verdict.reason

        if (!verdict.transient || attempt === MAX_ATTEMPTS - 1) {
          if (!verdict.transient) {
            console.error(`[agent] ${describeFailure(verdict.reason, model)}`)
          }
          return response
        }

        // The provider saying when to come back beats guessing.
        const wait = retryAfterMs(response.headers.get("retry-after")) ?? computeBackoff(attempt)
        console.warn(
          `[agent] ${model} ${verdict.reason} (HTTP ${response.status}), retrying in ${wait}ms ` +
            `(attempt ${attempt + 1}/${MAX_ATTEMPTS})`
        )
        await sleep(wait)
      }

      /**
       * Every retry on the primary model is spent, and the failure was the
       * transient kind. A second model is the only move left.
       *
       * Opt-in, and named in the environment. What was here before did this
       * implicitly: it stripped `:free` off the model id and then reached for
       * google/gemini-2.5-flash, so a rate limit on the free tier silently
       * became a billable request nobody had agreed to. An operator running on
       * the free tier deliberately should get an error, not an invoice.
       */
      const fallback = env("AGENT_FALLBACK_MODEL")

      if (fallback && fallback !== model && options?.body && typeof options.body === "string") {
        try {
          const parsed = JSON.parse(options.body)
          parsed.model = fallback

          console.warn(`[agent] ${model} unavailable (${lastReason}); trying ${fallback}`)

          const response = await fetch(url, { ...options, body: JSON.stringify(parsed) })
          if (response.ok) return response
        } catch {
          // Fall through to the error below; the primary failure is the one
          // worth reporting, not whatever the fallback did.
        }
      }

      throw new Error(describeFailure(lastReason, model))
    },
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The model id out of the request body, for logs that name what failed. */
function readModelId(options: RequestInit | undefined): string {
  if (!options?.body || typeof options.body !== "string") return "the model"

  try {
    return JSON.parse(options.body).model || "the model"
  } catch {
    return "the model"
  }
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

export const HERMES_MODEL_ALIASES: Record<string, string> = {
  "hermes-3": "nousresearch/hermes-3-llama-3.1-70b",
  "hermes-3-70b": "nousresearch/hermes-3-llama-3.1-70b",
  "hermes-3-405b": "nousresearch/hermes-3-llama-3.1-405b",
  "hermes-2-pro": "nousresearch/hermes-2-pro-llama-3-8b",
  "deephermes": "nousresearch/deephermes-3-llama-3-8b-preview",
}

export function getModelId(target?: ModelTier | string | ResolveModelOptions): string {
  if (typeof target === "string") {
    if (HERMES_MODEL_ALIASES[target.toLowerCase()]) {
      return HERMES_MODEL_ALIASES[target.toLowerCase()]
    }
    if (target.includes("/")) {
      return target
    }
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
    const trimmed = options.model.trim()
    if (HERMES_MODEL_ALIASES[trimmed.toLowerCase()]) {
      return HERMES_MODEL_ALIASES[trimmed.toLowerCase()]
    }
    return trimmed
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

/**
 * Whether a model id belongs to the provider that is configured.
 *
 * Gemini ids never contain a slash — `gemini-3.1-flash-lite` — while gateway
 * ids always do: `z-ai/glm-5.2:free`, `nvidia/nemotron...`. Handing one to the
 * other produces a 404 from a URL like
 * `generativelanguage.googleapis.com/v1beta/z-ai/glm-5.2:free`, which is what
 * "the assistant is not working" looked like from the outside.
 */
export function modelSuitsProvider(modelId: string, mode: AgentProviderMode): boolean {
  if (mode === "google") return !modelId.includes("/")
  return true
}

export function resolveAgentModel(target?: ModelTier | string | ResolveModelOptions): LanguageModel {
  const modelId = getModelId(target)
  const mode = getProviderMode()

  if (mode === "google" && !modelSuitsProvider(modelId, mode)) {
    // A gateway-style id was asked for while Google is configured. If there is
    // an OpenRouter key, honour the request through the provider that can
    // actually serve it; otherwise fall back to the configured Google model
    // rather than sending a request that is certain to 404.
    if (env("OPENROUTER_API_KEY")) {
      return openrouterProvider()(modelId)
    }

    const fallback = env("AGENT_MODEL") || DEFAULT_GOOGLE_MODEL
    console.warn(
      `[MODEL] "${modelId}" is not a Google model and no OPENROUTER_API_KEY is set. Using "${fallback}" instead.`
    )
    return googleProvider()(fallback)
  }

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
