/**
 * Whether the model tiering is doing anything.
 *
 * `model.ts` defines two tiers and routes a dozen purposes across them: `chat`
 * for the reasoning the business depends on, `fast` for summarising and
 * triage. The whole point is that the expensive job and the cheap one need
 * different models.
 *
 * Nothing enforces that, and both defaults are the same id, so the natural
 * end state is every purpose pinned to one model with the tiering still there
 * on paper. That is what this deployment did: ten purposes, one lite model,
 * including the finance reasoning and the document OCR.
 *
 * It is invisible from the outside. The agent does not fail; it just answers
 * worse than the design intends, which reads as the assistant being unreliable
 * rather than as a configuration nobody revisited. So preflight says it out
 * loud.
 */

/** Model ids that name themselves as the small one. */
const SMALL_MARKERS = [/-lite\b/i, /\bhaiku\b/i, /\bmini\b/i, /\bnano\b/i, /\bsmall\b/i, /-8b\b/i, /-4b\b/i]

/** Purposes where a small model shows most: multi-step reasoning over many tools. */
export const HEAVY_PURPOSES = ["chat", "finance", "replenishment", "ocr", "operations"] as const

export function looksSmall(modelId: string): boolean {
  return SMALL_MARKERS.some((marker) => marker.test(modelId))
}

export interface TierFinding {
  level: "warn" | "ok"
  message: string
}

/**
 * Judge a purpose-to-model map.
 *
 * Takes the resolved map rather than reading the environment itself, so this
 * stays pure and the caller decides what "resolved" means.
 */
export function reviewTiers(resolved: Record<string, string>): TierFinding[] {
  const entries = Object.entries(resolved)
  if (entries.length === 0) return []

  const distinct = new Set(entries.map(([, model]) => model))
  const findings: TierFinding[] = []

  const heavyOnSmall = entries.filter(
    ([purpose, model]) => (HEAVY_PURPOSES as readonly string[]).includes(purpose) && looksSmall(model)
  )

  if (heavyOnSmall.length > 0) {
    const model = heavyOnSmall[0][1]
    findings.push({
      level: "warn",
      message:
        `${heavyOnSmall.map(([p]) => p).join(", ")} run on ${model}, which is the small model in its family. ` +
        `These are the multi-step jobs with the most tools in the prompt, and a small model shows there first — ` +
        `as wrong answers rather than as errors. Set AGENT_MODEL to a larger model and leave AGENT_FAST_MODEL small.`,
    })
  }

  if (distinct.size === 1 && entries.length > 1) {
    findings.push({
      level: "warn",
      message:
        `All ${entries.length} agent purposes use ${entries[0][1]}. The chat and fast tiers exist to be different ` +
        `models; pinned to one, the tiering does nothing and every cheap job pays the expensive model's price, ` +
        `or every expensive job gets the cheap model's answer.`,
    })
  }

  if (findings.length === 0) {
    findings.push({
      level: "ok",
      message: `${distinct.size} model(s) across ${entries.length} purposes.`,
    })
  }

  return findings
}
