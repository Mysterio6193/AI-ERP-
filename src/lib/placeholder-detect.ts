/**
 * Spotting invented data before a customer acts on it.
 *
 * Seed and demo data has a habit of surviving into production, and payment
 * details are the case where that stops being cosmetic: an invoice carrying a
 * fabricated BSB and account number asks a real customer to send real money
 * somewhere that either fails or belongs to a stranger.
 *
 * Empty bank details are caught by their absence. These are the ones that look
 * filled in.
 */

/** Digits only, so formatting differences do not hide a pattern. */
function digits(value: string) {
  return value.replace(/\D/g, "")
}

/** 11223344, 5566, 999999 — doubled or repeated runs. */
function isRepeatingPairs(d: string) {
  if (d.length < 6) return false
  return /^(\d)\1*$/.test(d) || /^(?:(\d)\1){3,}$/.test(d)
}

/** 012345, 123456789, 987654 — a straight run up or down. */
function isSequential(d: string) {
  if (d.length < 5) return false

  let up = true
  let down = true

  for (let i = 1; i < d.length; i++) {
    const step = Number(d[i]) - Number(d[i - 1])
    if (step !== 1) up = false
    if (step !== -1) down = false
  }

  return up || down
}

export interface PlaceholderCheck {
  suspicious: boolean
  reason?: string
}

/**
 * Whether a bank account or BSB looks like filler rather than a real account.
 *
 * Deliberately conservative: a false positive costs someone a moment
 * confirming their own details, while a false negative sends an invoice with
 * an account number nobody can pay.
 */
export function looksLikePlaceholder(value: string | null | undefined): PlaceholderCheck {
  const raw = (value || "").trim()
  if (!raw) return { suspicious: false }

  const d = digits(raw)
  if (!d) return { suspicious: false }

  if (/^0+$/.test(d)) {
    return { suspicious: true, reason: "all zeros" }
  }

  if (isRepeatingPairs(d)) {
    return { suspicious: true, reason: "repeated digits" }
  }

  if (isSequential(d)) {
    return { suspicious: true, reason: "sequential digits" }
  }

  if (/^(1234|0000|1111|9999)/.test(d)) {
    return { suspicious: true, reason: "starts with a filler pattern" }
  }

  return { suspicious: false }
}

/** The obvious stand-ins people leave in a name field. */
export function looksLikeFillerText(value: string | null | undefined): boolean {
  const v = (value || "").trim().toLowerCase()
  if (!v) return false

  return ["test", "demo", "example", "placeholder", "your company", "n/a", "tbc", "todo", "xxx"].some(
    (needle) => v === needle || v.startsWith(`${needle} `)
  )
}
