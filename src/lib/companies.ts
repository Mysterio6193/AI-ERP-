import { looksLikePlaceholder } from "@/lib/placeholder-detect"

/**
 * Creating and editing the entities a group bills from.
 *
 * A company here is not a preference — it is whose name, ABN and bank account
 * appear on an invoice. So the validation is about what a document needs to be
 * legally and practically payable, not about tidy input.
 */

export interface CompanyInput {
  name?: unknown
  tradingName?: unknown
  abn?: unknown
  country?: unknown
  baseCurrency?: unknown
  email?: unknown
  phone?: unknown
  website?: unknown
  address?: unknown
  city?: unknown
  state?: unknown
  postcode?: unknown
  bankName?: unknown
  bsb?: unknown
  accountNumber?: unknown
  accountName?: unknown
}

export interface CleanCompany {
  name: string
  tradingName: string | null
  abn: string | null
  country: string
  baseCurrency: string
  email: string | null
  phone: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  postcode: string | null
  bankName: string | null
  bsb: string | null
  accountNumber: string | null
  accountName: string | null
}

export type CompanyVerdict =
  | { ok: true; company: CleanCompany }
  | { ok: false; field: string; error: string }

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "")
const orNull = (value: unknown): string | null => text(value) || null

/**
 * An ABN is eleven digits with a checksum, and a wrong one on a tax invoice
 * makes it not a tax invoice. Checked properly rather than by length, because
 * the common failure is a transposed pair, which length cannot catch.
 */
export function isValidAbn(abn: string): boolean {
  const digits = abn.replace(/\s/g, "")
  if (!/^\d{11}$/.test(digits)) return false

  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  const total = digits
    .split("")
    .map((digit, index) => (index === 0 ? Number(digit) - 1 : Number(digit)) * weights[index])
    .reduce((sum, value) => sum + value, 0)

  return total % 89 === 0
}

/** BSB is six digits, conventionally written 000-000. */
export function isValidBsb(bsb: string): boolean {
  return /^\d{6}$/.test(bsb.replace(/[\s-]/g, ""))
}

export function validateCompany(input: CompanyInput): CompanyVerdict {
  const name = text(input.name)

  if (!name) {
    return { ok: false, field: "name", error: "A company name is required — it goes on every invoice." }
  }

  const abn = orNull(input.abn)
  if (abn && !isValidAbn(abn)) {
    return {
      ok: false,
      field: "abn",
      error: "That ABN fails its checksum. A wrong ABN makes a tax invoice invalid, so it is worth re-checking.",
    }
  }

  const bsb = orNull(input.bsb)
  if (bsb && !isValidBsb(bsb)) {
    return { ok: false, field: "bsb", error: "A BSB is six digits, usually written 000-000." }
  }

  /**
   * The important one. An invoice carrying an invented account asks a real
   * customer to send real money somewhere that either bounces or belongs to a
   * stranger, and nobody notices until the money is gone.
   */
  for (const [field, value] of [["bsb", bsb], ["accountNumber", orNull(input.accountNumber)]] as const) {
    if (!value) continue

    const check = looksLikePlaceholder(value)
    if (check.suspicious) {
      return {
        ok: false,
        field,
        error: `That ${field === "bsb" ? "BSB" : "account number"} looks made up (${check.reason}). Payment details must be the real account, or an invoice sends money to the wrong place.`,
      }
    }
  }

  return {
    ok: true,
    company: {
      name,
      tradingName: orNull(input.tradingName),
      abn,
      // Country drives currency, tax and date formatting, so it always has one.
      country: text(input.country) || "AU",
      baseCurrency: text(input.baseCurrency) || (text(input.country) === "IN" ? "INR" : "AUD"),
      email: orNull(input.email),
      phone: orNull(input.phone),
      website: orNull(input.website),
      address: orNull(input.address),
      city: orNull(input.city),
      state: orNull(input.state),
      postcode: orNull(input.postcode),
      bankName: orNull(input.bankName),
      bsb,
      accountNumber: orNull(input.accountNumber),
      accountName: orNull(input.accountName),
    },
  }
}

/**
 * Whether an entity is ready to raise an invoice.
 *
 * Separate from validation because a company can legitimately be created before
 * its bank account is known — but it must not bill until it is.
 */
export function canRaiseInvoices(company: {
  abn?: string | null
  bsb?: string | null
  accountNumber?: string | null
}): { ok: boolean; missing: string[] } {
  const missing: string[] = []

  if (!company.abn) missing.push("ABN")
  if (!company.bsb) missing.push("BSB")
  if (!company.accountNumber) missing.push("account number")

  return { ok: missing.length === 0, missing }
}
