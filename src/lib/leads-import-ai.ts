import { generateText } from "ai"

import { resolveAgentModel } from "@/lib/agent/model"
import {
  LEAD_FIELDS,
  columnLooksCategorical,
  inferColumnMapping,
  pickNameColumn,
  preferFilledColumns,
} from "@/lib/leads-import"

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

/** How many example values per column the model is shown. */
const SAMPLES_PER_COLUMN = 3

/** Longest sample value sent; survey options run to a hundred characters. */
const MAX_SAMPLE_CHARS = 70

export interface ColumnProfile {
  column: string
  filled: number
  samples: string[]
}

/**
 * A compact picture of each column: its name, how much of it is filled, and a
 * few real values.
 *
 * Sending whole rows does not scale — this export has 78 columns, and five rows
 * of it is a wall of JSON in which the one useful column is invisible. Columns
 * are what the question is about, so columns are what gets sent. Empty ones are
 * dropped outright: a column nobody filled in cannot be the business name, and
 * this file has several.
 */
export function profileColumns(
  headers: string[],
  rows: Array<Record<string, string>>
): ColumnProfile[] {
  const profiles: ColumnProfile[] = []

  for (const column of headers) {
    const values = rows.map((row) => (row[column] ?? "").trim()).filter((value) => value !== "")
    if (values.length === 0) continue

    const distinct: string[] = []
    for (const value of values) {
      if (distinct.length >= SAMPLES_PER_COLUMN) break
      if (!distinct.includes(value)) distinct.push(value)
    }

    profiles.push({
      column,
      filled: values.length,
      samples: distinct.map((value) =>
        value.length > MAX_SAMPLE_CHARS ? `${value.slice(0, MAX_SAMPLE_CHARS)}…` : value
      ),
    })
  }

  return profiles
}

export interface AiMappingResult {
  mapping: Record<string, string | null>
  /** Which method produced this, so the page can say so rather than imply certainty. */
  method: "aliases" | "ai" | "columns" | "ai-failed"
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
- contactName: the person's first name, or their whole name if it is in one column
- contactLastName: their surname, ONLY when it is in a separate column
- email, phone
- suburb, state, postcode
- industry: what KIND of business it is, e.g. "Restaurant", "Distributor". This
  is a category, never the business's own name.
- source: where the lead came from
- notes: free text about them
- estimatedValue: expected spend

Critical distinctions:
- Judge a column by its SAMPLE VALUES, not its name. A column called
  "Organization" or "Account" may contain survey answers rather than company
  names — if its values are categories, it is "industry", not "businessName".
- Prefer a column that is mostly filled and whose values are nearly all
  different. Business names are distinct; categories repeat.
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


  const profiles = profileColumns(input.headers, input.rows)
  const table = [
    `The file has ${input.rows.length} rows. Columns that contain data:`,
    "",
    ...profiles.map(
      (profile) =>
        `- "${profile.column}" (${profile.filled}/${input.rows.length} filled) e.g. ${profile.samples
          .map((sample) => JSON.stringify(sample))
          .join(", ")}`
    ),
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

    if (!jsonText) return { mapping: { ...fallback, businessName: null }, method: "ai-failed" }

    const mapping = validateAiMapping(JSON.parse(jsonText), input.headers)

    // The model can pick a category column too. Same test, same answer.
    if (mapping.businessName && namesLookCategorical(mapping.businessName, input.rows)) {
      mapping.businessName = null
    }

    if (!mapping.businessName) {
      return { mapping, method: "ai-failed" }
    }

    return { mapping, method: "ai" }
  } catch (error) {
    // Reported as no answer rather than as the alias guess, so the caller can
    // tell "the model had nothing" from "the model agreed with the guess" and
    // go on to try something else.
    console.error("AI column mapping failed:", error)
    return { mapping: { ...fallback, businessName: null }, method: "ai-failed" }
  }
}

/**
 * The mapping to use, cheapest route first.
 *
 * Alias matching is free and right for most files, so a model is only asked
 * when it could not find the one column the import cannot proceed without.
 */
function namesLookCategorical(column: string, rows: Array<Record<string, string>>) {
  return columnLooksCategorical(rows.map((row) => row[column] ?? ""))
}

export async function resolveColumnMapping(input: {
  headers: string[]
  rows: Array<Record<string, string>>
  useAi?: boolean
  modelOverride?: string
}): Promise<AiMappingResult> {
  // Header matching first, then corrected against what the columns hold.
  const guess = preferFilledColumns(inferColumnMapping(input.headers), input.headers, input.rows)

  /**
   * A header can be a perfectly good name for a column and still describe the
   * wrong thing. This export has an "Organization" column — exactly what a
   * business name should be called — filled with "Restaurant / Commercial
   * Foodservice (e.g. QSR, Fine Dining, Cafe, Pub)", because whoever built the
   * form pointed the survey answer at it. The header cannot reveal that; only
   * the values can. So a guess that lands on a categorical column is treated as
   * no guess at all, and the values get read instead.
   */
  const guessIsUsable =
    Boolean(guess.businessName) && !namesLookCategorical(guess.businessName as string, input.rows)

  if (guessIsUsable || input.useAi === false) {
    return { mapping: guess, method: "aliases" }
  }

  const fromAi = await mapColumnsWithAi(input)
  if (fromAi.method === "ai" && fromAi.mapping.businessName) return fromAi

  /**
   * The model is rate-limited on the free tier often enough that it cannot be
   * the only thing standing between a wide export and a bad import. Scoring the
   * columns by their contents needs no model and finds the same answer here.
   */
  const scored = pickNameColumn(input.headers, input.rows)

  if (scored) {
    return { mapping: { ...guess, businessName: scored }, method: "columns" }
  }

  // Nothing found it. Returning the categorical guess would import categories
  // as names, which is the failure this whole path exists to prevent — so the
  // question goes to a person instead.
  return { mapping: { ...guess, businessName: null }, method: "ai-failed" }
}
