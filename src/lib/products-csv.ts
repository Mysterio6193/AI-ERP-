type CsvRow = Record<string, string>

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "")
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

export function stringifyProductsCsv(rows: CsvRow[]) {
  if (!rows.length) return ""
  const headers = Object.keys(rows[0])
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? "")).join(",")),
  ].join("\n")
}

export function parseSimpleCsv(csv: string) {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length < 2) {
    return []
  }

  const headers = lines[0].split(",").map((header) => header.trim())
  return lines.slice(1).map((line) => {
    const cells = line.split(",")
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() || ""]))
  })
}
