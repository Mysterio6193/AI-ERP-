/**
 * A small five-field cron evaluator.
 *
 * Deliberately not a dependency: the app needs "is this due" and "when next",
 * over standard `minute hour day-of-month month day-of-week` expressions, and
 * a self-contained ~120 lines is easier to reason about than a package whose
 * timezone and DST behaviour we would have to characterise anyway.
 *
 * All evaluation is in the server's local time.
 */

export interface CronFields {
  minutes: Set<number>
  hours: Set<number>
  daysOfMonth: Set<number>
  months: Set<number>
  daysOfWeek: Set<number>
}

const RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  // Day of week. 0 and 7 both mean Sunday - `* * * * 7` is common in real
  // crontabs, so 7 must pass the range check and is normalised to 0 below.
  [0, 7],
]

const NAMED: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
}

const DAY_NAMES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function parseField(raw: string, index: number): Set<number> {
  const [min, max] = RANGES[index]
  const values = new Set<number>()

  for (const part of raw.split(",")) {
    const chunk = part.trim().toLowerCase()
    if (!chunk) {
      throw new Error(`Empty value in field ${index + 1}`)
    }

    // Named days and months, so "mon-fri" and "jan" work.
    const named = index === 4 ? DAY_NAMES : index === 3 ? MONTH_NAMES : null
    const resolve = (token: string) => {
      if (named && token in named) {
        return named[token]
      }

      const parsed = Number(token)
      if (!Number.isInteger(parsed)) {
        throw new Error(`"${token}" is not a valid value in field ${index + 1}`)
      }

      return parsed
    }

    const [rangePart, stepPart] = chunk.split("/")
    const step = stepPart === undefined ? 1 : Number(stepPart)

    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`Invalid step "${stepPart}" in field ${index + 1}`)
    }

    let from: number
    let to: number

    if (rangePart === "*") {
      from = min
      to = max
    } else if (rangePart.includes("-")) {
      const [start, end] = rangePart.split("-")
      from = resolve(start)
      to = resolve(end)
    } else {
      from = resolve(rangePart)
      to = stepPart === undefined ? from : max
    }

    if (from < min || to > max || from > to) {
      throw new Error(`"${chunk}" is out of range for field ${index + 1} (${min}-${max})`)
    }

    for (let value = from; value <= to; value += step) {
      // Sunday is both 0 and 7 in common usage.
      values.add(index === 4 && value === 7 ? 0 : value)
    }
  }

  return values
}

export function parseCron(expression: string): CronFields {
  const normalised = (NAMED[expression.trim().toLowerCase()] || expression).trim()
  const parts = normalised.split(/\s+/)

  if (parts.length !== 5) {
    throw new Error(
      `A cron expression needs 5 fields (minute hour day month weekday), got ${parts.length}`
    )
  }

  const [minutes, hours, daysOfMonth, months, daysOfWeek] = parts.map((part, index) =>
    parseField(part, index)
  )

  return { minutes, hours, daysOfMonth, months, daysOfWeek }
}

/** True when `date` falls exactly on a scheduled minute. */
export function matches(fields: CronFields, date: Date) {
  const dayOfMonthRestricted = fields.daysOfMonth.size !== 31
  const dayOfWeekRestricted = fields.daysOfWeek.size !== 7

  const dayMatch =
    dayOfMonthRestricted && dayOfWeekRestricted
      ? // Standard cron quirk: when both day fields are restricted they are
        // ORed, not ANDed.
        fields.daysOfMonth.has(date.getDate()) || fields.daysOfWeek.has(date.getDay())
      : (!dayOfMonthRestricted || fields.daysOfMonth.has(date.getDate())) &&
        (!dayOfWeekRestricted || fields.daysOfWeek.has(date.getDay()))

  return (
    fields.minutes.has(date.getMinutes()) &&
    fields.hours.has(date.getHours()) &&
    fields.months.has(date.getMonth() + 1) &&
    dayMatch
  )
}

/**
 * The next minute at or after `from` that the expression fires.
 *
 * Steps minute by minute, bounded to roughly four years so an expression that
 * can never match (31 February) terminates instead of looping.
 */
export function nextRun(expression: string, from: Date = new Date()): Date | null {
  const fields = parseCron(expression)

  const cursor = new Date(from.getTime())
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() + 1)

  const limit = 60 * 24 * 366 * 4

  for (let step = 0; step < limit; step += 1) {
    if (matches(fields, cursor)) {
      return cursor
    }

    cursor.setMinutes(cursor.getMinutes() + 1)
  }

  return null
}

/** Validates an expression for the settings UI. */
export function validateCron(expression: string): { ok: boolean; error?: string; next?: Date } {
  try {
    const next = nextRun(expression)

    if (!next) {
      return { ok: false, error: "That expression will never fire" }
    }

    return { ok: true, next }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid expression" }
  }
}

export function describeCron(expression: string) {
  const trimmed = expression.trim().toLowerCase()

  if (trimmed in NAMED) {
    return trimmed.replace("@", "Every ").replace("ly", "")
  }

  const common: Record<string, string> = {
    "* * * * *": "Every minute",
    "*/5 * * * *": "Every 5 minutes",
    "*/15 * * * *": "Every 15 minutes",
    "*/30 * * * *": "Every 30 minutes",
    "0 * * * *": "Hourly",
    "0 9 * * *": "Every day at 9am",
    "0 9 * * 1-5": "Weekdays at 9am",
    "0 17 * * 1-5": "Weekdays at 5pm",
    "0 9 * * 1": "Mondays at 9am",
  }

  return common[expression.trim()] || expression
}
