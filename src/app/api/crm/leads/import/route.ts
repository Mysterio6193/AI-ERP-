import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { columnLooksCategorical, importLeads, parseCsv } from "@/lib/leads-import"
import { resolveColumnMapping } from "@/lib/leads-import-ai"

/**
 * Bulk lead import.
 *
 * Two phases on purpose: an `analyse` pass returns the guessed column mapping
 * and a dry-run count so a human confirms what will happen, then `import`
 * commits. Writing six thousand rows off an unreviewed guess is how a prospect
 * list ends up mangled.
 */

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const csv = String(body.csv || "")
  const mode = String(body.mode || "analyse")

  if (!csv.trim()) {
    return NextResponse.json({ success: false, error: "csv is required" }, { status: 400 })
  }

  try {
    const rows = parseCsv(csv)

    if (!rows.length) {
      return NextResponse.json(
        { success: false, error: "No data rows found. The file needs a header row and at least one record." },
        { status: 400 }
      )
    }

    const headers = Object.keys(rows[0])

    /**
     * A mapping the caller chose by hand always wins. Otherwise alias matching
     * runs first because it is free, and a model is asked only when that could
     * not find the one column the import cannot proceed without.
     */
    const chosen = body.mapping && typeof body.mapping === "object"
      ? { mapping: body.mapping as Record<string, string | null>, method: "manual" as const }
      : await resolveColumnMapping({ headers, rows, useAi: body.useAi !== false })

    const mapping = chosen.mapping

    if (!mapping.businessName) {
      return NextResponse.json(
        {
          success: false,
          error:
            "I could not work out which column holds the business name, even after reading the sample rows. Pick it below.",
          data: { headers, mapping, method: chosen.method },
        },
        { status: 400 }
      )
    }

    /**
     * A last look at the column before it becomes six thousand business names.
     * The mapping can be wrong for reasons this code cannot see — a stale page,
     * a hand-picked column, a model that read the sample rows badly — and the
     * values themselves are the one thing that tells on all of them.
     */
    const nameColumn = mapping.businessName as string
    const nameValues = rows.map((row) => row[nameColumn] ?? "")
    const suspectNameColumn = columnLooksCategorical(nameValues)

    const summary = await importLeads({
      rows,
      mapping,
      defaultSource: body.source ? String(body.source) : undefined,
      ownerId: body.ownerId ? String(body.ownerId) : auth.user!.id,
      dryRun: mode !== "import",
    })

    return NextResponse.json({
      success: true,
      data: {
        mode,
        headers,
        mapping,
        // Said out loud so the page can show whether this was matched or read.
        method: chosen.method,
        warning: suspectNameColumn
          ? `"${nameColumn}" repeats the same few values, so it looks like a category rather than a business name. Check the mapping before importing.`
          : null,
        summary,
        // A small preview so the mapping can be eyeballed against real values.
        preview: rows.slice(0, 5),
      },
    })
  } catch (error) {
    console.error("Lead import failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    )
  }
}
