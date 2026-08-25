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
export interface DuplicateKeys {
  email: string
  phoneKey: string
  nameKey: string
}

export interface KeyIndex {
  email: Set<string>
  phone: Set<string>
  name: Set<string>
}

/**
 * Why a row is being skipped, if it is.
 *
 * The database is checked before the file so a row that collides with both
 * counts as one we already knew — the more useful answer, since "you already
 * have them" tells someone to stop worrying, while "your sheet lists them
 * twice" tells them to go and fix the sheet.
 */
export function classifyDuplicate(
  keys: DuplicateKeys,
  known: KeyIndex,
  seen: KeyIndex
): "already-on-file" | "repeated-in-file" | null {
  const hits = (index: KeyIndex) =>
    (keys.email !== "" && index.email.has(keys.email)) ||
    (keys.phoneKey !== "" && index.phone.has(keys.phoneKey)) ||
    index.name.has(keys.nameKey)

  if (hits(known)) return "already-on-file"
  if (hits(seen)) return "repeated-in-file"

  return null
}

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

  /**
   * Keys already in the database, kept apart from keys seen earlier in this
   * file. The two are different answers to "why was this row skipped": one
   * means we already know them, the other means the sheet lists them twice,
   * and only the second is a problem with the file the person just sent.
   */
  const dbEmail = new Set<string>()
  const dbPhone = new Set<string>()
  const dbName = new Set<string>()

  for (const record of [...existingLeads, ...existingCustomers]) {
    const name = "businessName" in record ? record.businessName : record.name
    if (record.email) dbEmail.add(record.email.toLowerCase().trim())
    if (record.phone) dbPhone.add(normalisePhone(record.phone))
    if (name) dbName.add(normaliseKey(name))
  }

  const seenEmail = new Set<string>()
  const seenPhone = new Set<string>()
  const seenName = new Set<string>()

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

    const duplicate = classifyDuplicate(
      { email, phoneKey, nameKey },
      { email: dbEmail, phone: dbPhone, name: dbName },
      { email: seenEmail, phone: seenPhone, name: seenName }
    )

    if (duplicate) {
      if (duplicate === "already-on-file") {
        summary.duplicatesExisting += 1
        summary.skipped.push({ row: rowNumber, reason: "Already on file", value: businessName })
      } else {
        summary.duplicatesInFile += 1
        summary.skipped.push({ row: rowNumber, reason: "Repeated in this file", value: businessName })
      }

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
