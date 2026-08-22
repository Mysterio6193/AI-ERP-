/**
 * Human-readable settings diffs.
 *
 * An approval card that says "Run proposeSettingChange" with a JSON blob under
 * it is not consent — nobody can tell a rounding tweak from a tax rate change.
 * These turn a patch into the sentence someone would need to read before
 * tapping Approve.
 *
 * Pure: current values and patch are passed in.
 */

export interface SettingChange {
  path: string
  before: unknown
  after: unknown
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Fields that changed, flattened to dotted paths.
 *
 * Only keys present in the patch are considered, so an unchanged namespace
 * produces an empty list rather than a wall of identical values.
 */
export function diffSettings(
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
  prefix = ""
): SettingChange[] {
  const changes: SettingChange[] = []

  for (const [key, next] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key
    const before = current?.[key]

    if (isPlainObject(before) && isPlainObject(next)) {
      changes.push(...diffSettings(before, next, path))
      continue
    }

    // Arrays and scalars compare whole. Editing a bucket list means replacing
    // it, so a per-index diff would describe an edit nobody made.
    if (JSON.stringify(before) !== JSON.stringify(next)) {
      changes.push({ path, before, after: next })
    }
  }

  return changes
}

/** How a value should read on an approval card. */
export function formatSettingValue(value: unknown): string {
  if (value === null || value === undefined) return "not set"
  if (typeof value === "boolean") return value ? "on" : "off"
  if (Array.isArray(value)) return value.length === 0 ? "empty" : value.join(", ")
  if (isPlainObject(value)) return JSON.stringify(value)
  return String(value)
}

/** Field names that read as percentages, so the card can say "10% → 15%". */
const PERCENT_FIELDS = new Set([
  "defaultRate",
  "maxLineDiscountPercent",
  "discountPercent",
  "maxDiscountPercent",
])

function render(change: SettingChange) {
  const field = change.path.split(".").at(-1) ?? change.path
  const suffix = PERCENT_FIELDS.has(field) && typeof change.after === "number" ? "%" : ""
  const beforeSuffix =
    PERCENT_FIELDS.has(field) && typeof change.before === "number" ? "%" : ""

  return `${change.path}: ${formatSettingValue(change.before)}${beforeSuffix} → ${formatSettingValue(change.after)}${suffix}`
}

/**
 * One line summarising the whole change, for an approval card.
 *
 * Long changes are truncated with a count rather than filling the card, since
 * a card nobody reads to the end is the same as no card.
 */
export function describeSettingsDiff(
  namespace: string,
  changes: SettingChange[],
  maxShown = 3
): string {
  if (changes.length === 0) {
    return `Change ${namespace} settings (nothing would actually change)`
  }

  const shown = changes.slice(0, maxShown).map(render).join(", ")
  const rest = changes.length - maxShown

  return `Change ${namespace} settings: ${shown}${rest > 0 ? `, and ${rest} more` : ""}`
}
