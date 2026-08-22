import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { gateway, type LanguageModel } from "ai"

/**
 * Provider-agnostic model resolution.
 *
 * Three modes, chosen by AGENT_PROVIDER (or inferred from which keys exist):
 *   gateway - Vercel AI Gateway, plain "provider/model" strings, one key for every vendor
 *   local   - any OpenAI-compatible server: Ollama, LM Studio, llama.cpp, vLLM
 *   auto    - gateway when a key is present, otherwise local
 *
 * Nothing else in the agent layer imports a provider. Swapping vendors, or
 * moving the whole system onto a laptop with no internet, is an env change.
 */

export type AgentProviderMode = "gateway" | "local"

export type ModelTier = "chat" | "fast"

const DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-5"
const DEFAULT_GATEWAY_FAST_MODEL = "anthropic/claude-haiku-4.5"
const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1"
const DEFAULT_LOCAL_MODEL = "llama3.1"

function env(name: string) {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : undefined
}

export function getProviderMode(): AgentProviderMode {
  const explicit = env("AGENT_PROVIDER")?.toLowerCase()
  if (explicit === "gateway" || explicit === "local") {
    return explicit
  }

  // auto
  if (env("AI_GATEWAY_API_KEY") || env("VERCEL_OIDC_TOKEN")) {
    return "gateway"
  }

  return env("AGENT_LOCAL_BASE_URL") ? "local" : "gateway"
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

export function getModelId(tier: ModelTier = "chat") {
  const mode = getProviderMode()

  if (mode === "local") {
    return (
      (tier === "fast" ? env("AGENT_LOCAL_FAST_MODEL") : undefined) ||
      env("AGENT_LOCAL_MODEL") ||
      DEFAULT_LOCAL_MODEL
    )
  }

  return (
    (tier === "fast" ? env("AGENT_FAST_MODEL") : undefined) ||
    env("AGENT_MODEL") ||
    (tier === "fast" ? DEFAULT_GATEWAY_FAST_MODEL : DEFAULT_GATEWAY_MODEL)
  )
}

export function resolveAgentModel(tier: ModelTier = "chat"): LanguageModel {
  const modelId = getModelId(tier)

  if (getProviderMode() === "local") {
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
    baseUrl: mode === "local" ? getLocalBaseUrl() : "https://ai-gateway.vercel.sh/v1",
    configured: mode === "local" || Boolean(env("AI_GATEWAY_API_KEY") || env("VERCEL_OIDC_TOKEN")),
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
