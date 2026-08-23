/**
 * Shortening text for display.
 *
 * The dashboard's customer chart cut labels with `String(value).slice(0, 16)`,
 * which turns "Independent Grocers Network" into "Independent Groc" — no
 * ellipsis, cut mid-word, and indistinguishable from a company actually called
 * that. Names are how someone identifies the row they are looking for, so a
 * silent cut is worse than a visibly shortened one.
 */

const ELLIPSIS = "…"

/**
 * Shorten to `max` characters, breaking on a word boundary when one is close
 * enough that the result still reads as the original name.
 *
 * The ellipsis is included in the budget, so the returned string is never
 * longer than `max`.
 */
export function truncateLabel(value: unknown, max = 18): string {
  const text = String(value ?? "").trim()

  if (max <= 1) return text.length > max ? ELLIPSIS : text
  if (text.length <= max) return text

  const budget = max - 1
  const cut = text.slice(0, budget)
  const lastSpace = cut.lastIndexOf(" ")

  // Only honour a word boundary that is nearly at the cut. A boundary earlier
  // than that costs a whole word: at 18 characters "Independent Grocers
  // Network" would break after "Independent", which does not distinguish it
  // from any other Independent. Cutting mid-word keeps more of what
  // identifies the row, and the ellipsis already signals it is shortened.
  if (lastSpace > budget * 0.85) {
    return `${cut.slice(0, lastSpace).trimEnd()}${ELLIPSIS}`
  }

  return `${cut.trimEnd()}${ELLIPSIS}`
}

/**
 * Initials for an avatar or a dense chart tick.
 *
 * Caps at two so a five-word trading name does not become a block of letters.
 */
export function initials(value: unknown): string {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) return ""

  return words
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("")
}
