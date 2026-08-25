import { generateText } from "ai"

import { resolveAgentModel } from "@/lib/agent/model"
import { LEAD_FIELDS, inferColumnMapping } from "@/lib/leads-import"

/**
 * Reading a prospect list nobody designed for us.
 *
 * Alias matching handles the ordinary cases and costs nothing, so it still runs
 * first. It fails on the ones that are merely human: a column called "Who they
 * are", headers in another language, a name split across "First" and "Last", a
 * sheet whose columns are unlabelled entirely. A model reads those the way a
 * person would.
 *
 * What the model is asked for matters. It maps COLUMNS, not rows — it sees the
 * headers and a handful of sample values and returns which column means what,
 * and that mapping is then applied to all six thousand rows in code. Passing
 * every row through a model would be slow, expensive, and would quietly
 * paraphrase people's names.
 *
 * Nothing it returns is trusted. Column names it invents are dropped, fields it
 * does not know are dropped, and if it comes back unusable the deterministic
 * guess stands. A wrong mapping is worse than no mapping, because the import
 * appears to work.
 */

/** How many rows the model is shown. Enough to tell a name from a category. */
const SAMPLE_ROWS = 5

export interface AiMappingResult {
  mapping: Record<string, string | null>
  /** Which method produced this, so the page can say so rather than imply certainty. */
  method: "aliases" | "ai" | "ai-failed"
  reasoning?: string
}

/**
 * Keep only what the model could legitimately have said.
 *
 * Models name columns that are not there, reuse one column for two fields, and
 * invent field names. Each of those silently corrupts an import, so each is
 * dropped here rather than defended against later.
 */
export function validateAiMapping(
  raw: unknown,
  headers: string[]
): Record<string, string | null> {
  const clean: Record<string, string | null> = {}
  for (const field of LEAD_FIELDS) clean[field] = null

  if (!raw || typeof raw !== "object") return clean

  const used = new Set<string>()

  for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!(LEAD_FIELDS as readonly string[]).includes(field)) continue
    if (typeof value !== "string" || value.trim() === "") continue

    // Matched case-insensitively but stored as the file spells it, since that
    // is the key the rows are actually read by.
    const column = headers.find((header) => header.toLowerCase().trim() === value.toLowerCase().trim())

    if (!column) continue
    if (used.has(column)) continue

    clean[field] = column
    used.add(column)
  }

  return clean
}

const SYSTEM_PROMPT = `You map spreadsheet columns onto a fixed set of CRM lead fields.

You are given the column headers of a prospect list and a few sample rows.
Return ONLY a JSON object whose keys are field names and whose values are the
exact column header that holds that field. Omit a field entirely if no column
holds it. Never invent a column name — every value must be copied exactly from
the headers you were given.

The fields are:
- businessName: the name of the business itself (REQUIRED if any column holds it)
- contactName: the person's name
- email, phone
- suburb, state, postcode
- industry: what KIND of business it is, e.g. "Restaurant", "Distributor". This
  is a category, never the business's own name.
- source: where the lead came from
- notes: free text about them
- estimatedValue: expected spend

Critical distinctions:
- A column headed "Business Type", "Segment" or "Category" holds a CATEGORY.
  That is "industry", never "businessName".
- If the business name is split across several columns, choose the one that
  best identifies the business on its own.
- Headers may be in any language, or absent and replaced by "Column1" style
  names. Use the SAMPLE VALUES to decide what each column actually contains.

Return only the JSON object, no commentary.`

/** Ask a model which column is which, given the headers and some real values. */
export async function mapColumnsWithAi(input: {
  headers: string[]
  rows: Array<Record<string, string>>
  modelOverride?: string
}): Promise<AiMappingResult> {
  const fallback = inferColumnMapping(input.headers)

  if (input.headers.length === 0) {
    return { mapping: fallback, method: "ai-failed" }
  }

  const sample = input.rows.slice(0, SAMPLE_ROWS)
  const table = [
    `Headers: ${JSON.stringify(input.headers)}`,
    "",
    "Sample rows:",
    ...sample.map((row, index) => `${index + 1}. ${JSON.stringify(row)}`),
  ].join("\n")

  try {
    const result = await generateText({
      model: resolveAgentModel(input.modelOverride ?? "fast"),
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: table }],
      maxOutputTokens: 600,
    })

    const text = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    const jsonText = text.startsWith("{") ? text : text.match(/\{[\s\S]*\}/)?.[0]

    if (!jsonText) return { mapping: fallback, method: "ai-failed" }

    const mapping = validateAiMapping(JSON.parse(jsonText), input.headers)

    // A mapping with no business name is not an improvement on the guess; the
    // whole import is refused without one either way.
    if (!mapping.businessName && fallback.businessName) {
      return { mapping: fallback, method: "aliases" }
    }

    return { mapping, method: "ai" }
  } catch (error) {
    console.error("AI column mapping failed:", error)
    return { mapping: fallback, method: "ai-failed" }
  }
}

/**
 * The mapping to use, cheapest route first.
 *
 * Alias matching is free and right for most files, so a model is only asked
 * when it could not find the one column the import cannot proceed without.
 */
export async function resolveColumnMapping(input: {
  headers: string[]
  rows: Array<Record<string, string>>
  useAi?: boolean
  modelOverride?: string
}): Promise<AiMappingResult> {
  const guess = inferColumnMapping(input.headers)

  if (guess.businessName || input.useAi === false) {
    return { mapping: guess, method: "aliases" }
  }

  return mapColumnsWithAi(input)
}
