import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import { importLeads, inferColumnMapping, parseCsv } from "@/lib/leads-import"

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
    const mapping = body.mapping && typeof body.mapping === "object"
      ? (body.mapping as Record<string, string | null>)
      : inferColumnMapping(headers)

    if (!mapping.businessName) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not find a business name column. Map one before importing.",
          data: { headers, mapping },
        },
        { status: 400 }
      )
    }

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
