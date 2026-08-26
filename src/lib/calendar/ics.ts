/**
 * A subscribable calendar feed.
 *
 * This is the way to get deliveries and follow-ups into somebody's calendar
 * without registering an application with Google or Microsoft. Every calendar
 * app made in the last twenty years can subscribe to an iCalendar URL, and the
 * user does it themselves in about fifteen seconds — no OAuth client, no
 * consent screen, no vendor review, and nothing for us to hold on their behalf.
 *
 * The trade is that it is read-only and refreshes on the calendar app's own
 * schedule rather than instantly. For "when am I delivering to Bella Napoli",
 * that is the right trade.
 */

export interface CalendarEvent {
  /** Stable across regenerations, or the calendar shows duplicates every refresh. */
  uid: string
  start: Date
  /** Absent for an all-day entry, which is how a date with no time is shown. */
  end?: Date
  allDay?: boolean
  summary: string
  description?: string
  location?: string
  /** confirmed | tentative | cancelled — a cancelled delivery should grey out. */
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED"
  updatedAt?: Date
}

/** ICS timestamps are UTC with no punctuation: 20260825T093000Z */
function stamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function stampDate(date: Date): string {
  return stamp(date).slice(0, 8)
}

/**
 * Escape the four characters that would otherwise break the line structure.
 *
 * A customer called "Smith, Jones & Co" silently truncates every field after it
 * without this, and the calendar shows a delivery to "Smith".
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/**
 * Fold long lines at 75 octets, as the spec requires.
 *
 * Outlook in particular rejects a whole feed over this rather than the one line
 * that is too long, so a single long address loses the entire calendar.
 */
function fold(line: string): string {
  if (line.length <= 75) return line

  const parts: string[] = [line.slice(0, 75)]
  let rest = line.slice(75)

  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`)
    rest = rest.slice(74)
  }

  if (rest.length > 0) parts.push(` ${rest}`)

  return parts.join("\r\n")
}

export function buildIcsFeed(input: {
  name: string
  events: CalendarEvent[]
  now?: Date
}): string {
  const now = input.now ?? new Date()

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SupplySure OS//Operations Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(input.name)}`,
    // How often a subscribing client should come back. Advisory, but Google and
    // Outlook both read it, and without it they choose something very slow.
    "X-PUBLISHED-TTL:PT30M",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
  ]

  for (const event of input.events) {
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:${event.uid}`)
    lines.push(`DTSTAMP:${stamp(event.updatedAt ?? now)}`)

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${stampDate(event.start)}`)
      // DTEND is exclusive for all-day events, so a one-day entry ends the
      // next day; without this the event does not render at all in Outlook.
      const end = event.end ?? new Date(event.start.getTime() + 86400000)
      lines.push(`DTEND;VALUE=DATE:${stampDate(end)}`)
    } else {
      lines.push(`DTSTART:${stamp(event.start)}`)
      lines.push(`DTEND:${stamp(event.end ?? new Date(event.start.getTime() + 3600000))}`)
    }

    lines.push(`SUMMARY:${escapeText(event.summary)}`)
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`)
    if (event.status) lines.push(`STATUS:${event.status}`)

    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")

  // CRLF throughout, which the spec requires and Outlook enforces.
  return lines.map(fold).join("\r\n") + "\r\n"
}
