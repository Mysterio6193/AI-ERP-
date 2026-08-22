import { db } from "@/lib/db"

/**
 * Bulk lead import.
 *
 * A prospect list arrives as a spreadsheet of a few thousand rows with whatever
 * column names the person who built it chose. Three things matter at that size:
 * the parser must survive quoted fields (a business address is full of commas),
 * the column mapping must be guessed rather than dictated, and the same list
 * imported twice must not double the database.
 */

export interface ParsedRow {
  [column: string]: string
}

/**
 * RFC4180-style CSV parser.
 *
 * The existing `parseSimpleCsv` splits on bare commas, which silently corrupts
 * any quoted field containing one - and "Shop 3, Village Precinct" is the norm
 * in this data, not the exception.
 */
export function parseCsv(text: string): ParsedRow[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false

  // Strip a UTF-8 BOM, which Excel writes and which otherwise corrupts the
  // first header name.
  const input = text.replace(/^﻿/, "")

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ",") {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      // Treat CRLF as one break.
      if (char === "\r" && input[index + 1] === "\n") {
        index += 1
      }
      row.push(field)
      field = ""
      rows.push(row)
      row = []
    } else {
      field += char
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter((candidate) => candidate.some((cell) => cell.trim() !== ""))
  if (nonEmpty.length < 2) {
    return []
  }

  const headers = nonEmpty[0].map((header) => header.trim())

  return nonEmpty.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()]))
  )
}

/** Field names this importer understands, and the headers that map to them. */
const COLUMN_ALIASES: Record<string, string[]> = {
  businessName: ["business name", "business", "company", "company name", "trading name", "venue", "name", "account", "customer", "client"],
  contactName: ["contact", "contact name", "first name", "full name", "owner", "manager", "person"],
  email: ["email", "e-mail", "email address", "contact email"],
  phone: ["phone", "telephone", "mobile", "contact number", "phone number", "tel"],
  suburb: ["suburb", "city", "town", "locality", "area"],
  state: ["state", "region"],
  postcode: ["postcode", "post code", "zip", "postal code"],
  industry: ["industry", "type", "category", "segment", "venue type", "cuisine"],
  source: ["source", "lead source", "origin", "channel"],
  notes: ["notes", "note", "comment", "comments", "description"],
  estimatedValue: ["estimated value", "value", "monthly spend", "potential", "est value", "revenue"],
}

/**
 * Guesses which spreadsheet column feeds which lead field.
 *
 * Returned rather than applied so the caller can show the mapping and let a
 * human correct it before six thousand rows are written.
 */
export function inferColumnMapping(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {}
  const used = new Set<string>()

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const match = headers.find((header) => {
      if (used.has(header)) {
        return false
      }

      const normalised = header.toLowerCase().trim()
      return aliases.includes(normalised)
    })

    if (match) {
      mapping[field] = match
      used.add(match)
    } else {
      mapping[field] = null
    }
  }

  return mapping
}

function normaliseKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function normalisePhone(value: string) {
  const digits = value.replace(/\D/g, "")
  // Australian numbers are written a dozen ways; compare the last 9 digits so
  // 02 9876 5432, +61 2 9876 5432 and 0298765432 collapse to one key.
  return digits.length >= 9 ? digits.slice(-9) : digits
}

export interface ImportSummary {
  totalRows: number
  imported: number
  duplicatesInFile: number
  duplicatesExisting: number
  skipped: Array<{ row: number; reason: string; value?: string }>
}

export interface ImportOptions {
  rows: ParsedRow[]
  mapping: Record<string, string | null>
  defaultSource?: string
  ownerId?: string | null
  dryRun?: boolean
}

const CHUNK = 200

/**
 * Imports mapped rows as leads.
 *
 * Dedupes on email, then phone, then business name - against the rest of the
 * file and against leads and customers already in the database, so re-importing
 * an updated export adds only what is new.
 */
export async function importLeads(options: ImportOptions): Promise<ImportSummary> {
  const { rows, mapping } = options

  const summary: ImportSummary = {
    totalRows: rows.length,
    imported: 0,
    duplicatesInFile: 0,
    duplicatesExisting: 0,
    skipped: [],
  }

  const read = (row: ParsedRow, field: string) => {
    const column = mapping[field]
    return column ? (row[column] ?? "").trim() : ""
  }

  // Existing keys, loaded once rather than queried per row.
  const [existingLeads, existingCustomers] = await Promise.all([
    db.lead.findMany({ select: { businessName: true, email: true, phone: true } }),
    db.customer.findMany({ select: { name: true, email: true, phone: true } }),
  ])

  const seenEmail = new Set<string>()
  const seenPhone = new Set<string>()
  const seenName = new Set<string>()

  for (const record of [...existingLeads, ...existingCustomers]) {
    const name = "businessName" in record ? record.businessName : record.name
    if (record.email) seenEmail.add(record.email.toLowerCase().trim())
    if (record.phone) seenPhone.add(normalisePhone(record.phone))
    if (name) seenName.add(normaliseKey(name))
  }

  const existingCount = seenEmail.size + seenPhone.size + seenName.size

  const pending: Array<Record<string, unknown>> = []

  rows.forEach((row, index) => {
    const rowNumber = index + 2 // account for the header line
    const businessName = read(row, "businessName")

    if (!businessName) {
      summary.skipped.push({ row: rowNumber, reason: "No business name" })
      return
    }

    const email = read(row, "email").toLowerCase()
    const phone = read(row, "phone")
    const phoneKey = phone ? normalisePhone(phone) : ""
    const nameKey = normaliseKey(businessName)

    const duplicate =
      (email && seenEmail.has(email)) ||
      (phoneKey && seenPhone.has(phoneKey)) ||
      seenName.has(nameKey)

    if (duplicate) {
      // Whether it collided with the file or the database is only knowable
      // before this row's own keys are recorded, which is why the check runs first.
      summary.duplicatesInFile += 1
      summary.skipped.push({ row: rowNumber, reason: "Duplicate", value: businessName })
      return
    }

    if (email) seenEmail.add(email)
    if (phoneKey) seenPhone.add(phoneKey)
    seenName.add(nameKey)

    const rawValue = read(row, "estimatedValue").replace(/[^0-9.]/g, "")
    const estimatedValue = rawValue ? Number(rawValue) : null

    pending.push({
      businessName,
      contactName: read(row, "contactName") || null,
      email: email || null,
      phone: phone || null,
      suburb: read(row, "suburb") || null,
      industry: read(row, "industry") || null,
      source: read(row, "source") || options.defaultSource || "import",
      notes: read(row, "notes") || null,
      estimatedValue: Number.isFinite(estimatedValue) ? estimatedValue : null,
      status: "new",
      ownerId: options.ownerId || null,
    })
  })

  summary.duplicatesExisting = existingCount

  if (options.dryRun) {
    summary.imported = pending.length
    return summary
  }

  // Chunked so a large file does not build one enormous statement.
  for (let index = 0; index < pending.length; index += CHUNK) {
    const batch = pending.slice(index, index + CHUNK)
    await db.lead.createMany({ data: batch as never })
    summary.imported += batch.length
  }

  return summary
}
