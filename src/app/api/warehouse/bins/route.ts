import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import {
  consumeFromBin,
  createBin,
  generateBins,
  listBins,
  planPick,
  putaway,
  resequenceBins,
} from "@/lib/warehouse/bin-service"

/** Bin locations: what exists, what is in them, and the order they are walked. */

export const dynamic = "force-dynamic"

/** The warehouse the request is about, falling back to the default one. */
async function resolveWarehouseId(request: NextRequest, explicit?: string | null) {
  if (explicit) return explicit

  const companyId = await getActiveCompanyId(request)
  const warehouse = await db.warehouse.findFirst({
    where: { status: "active", ...(companyId ? { companyId } : {}) },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true },
  })

  return warehouse?.id ?? null
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "warehouse", "sales"])
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)
  const warehouseId = await resolveWarehouseId(request, searchParams.get("warehouseId"))

  if (!warehouseId) {
    return NextResponse.json({ success: false, error: "No warehouse found" }, { status: 404 })
  }

  try {
    const bins = await listBins(warehouseId, { zone: searchParams.get("zone") || undefined })

    // The zone list comes from the bins themselves rather than a setting: a
    // zone exists because something is racked in it.
    const zones = [...new Set(bins.map((bin) => bin.zone))].sort()

    return NextResponse.json({
      success: true,
      data: {
        warehouseId,
        zones,
        bins,
        totals: {
          bins: bins.length,
          occupied: bins.filter((bin) => bin.used > 0).length,
          units: bins.reduce((sum, bin) => sum + bin.used, 0),
        },
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load bins" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "warehouse"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")

  const companyId = await getActiveCompanyId(request)
  const warehouseId = await resolveWarehouseId(request, body.warehouseId)

  if (!warehouseId) {
    return NextResponse.json({ success: false, error: "No warehouse found" }, { status: 404 })
  }

  try {
    if (action === "create") {
      const result = await createBin(warehouseId, String(body.code || ""), {
        isPickable: body.isPickable !== false,
        maxUnits: body.maxUnits === null || body.maxUnits === undefined ? null : Number(body.maxUnits),
        status: body.status ? String(body.status) : undefined,
        companyId,
      })

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    if (action === "generate") {
      const result = await generateBins(
        warehouseId,
        {
          zone: String(body.zone || ""),
          aisles: Number(body.aisles),
          racksPerAisle: Number(body.racksPerAisle),
          levels: Number(body.levels),
          maxUnits:
            body.maxUnits === null || body.maxUnits === undefined ? null : Number(body.maxUnits),
        },
        companyId
      )

      if (result.error) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    if (action === "resequence") {
      return NextResponse.json({
        success: true,
        data: await resequenceBins(warehouseId, companyId),
      })
    }

    if (action === "putaway") {
      const result = await putaway(
        warehouseId,
        String(body.productId || ""),
        Number(body.quantity),
        { binId: body.binId ?? null, batchId: body.batchId ?? null, companyId }
      )

      if (!result.ok) {
        // 409, not 400: a full bin is a state of the warehouse, not a
        // malformed request, and the caller can retry after freeing space.
        return NextResponse.json({ success: false, error: result.error }, { status: 409 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    if (action === "consume") {
      const result = await consumeFromBin(
        String(body.binId || ""),
        String(body.productId || ""),
        Number(body.quantity),
        String(body.batchCode || "")
      )

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 409 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    if (action === "plan") {
      const lines = Array.isArray(body.lines) ? body.lines : []

      if (!lines.length) {
        return NextResponse.json({ success: false, error: "lines is required" }, { status: 400 })
      }

      const plan = await planPick(
        warehouseId,
        lines.map((line: { productId?: unknown; quantity?: unknown }) => ({
          productId: String(line.productId || ""),
          quantity: Number(line.quantity) || 0,
        })),
        companyId
      )

      return NextResponse.json({ success: true, data: plan })
    }

    return NextResponse.json(
      {
        success: false,
        error: `Unknown action "${action}". Expected create, generate, resequence, putaway, consume or plan.`,
      },
      { status: 400 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Request failed" },
      { status: 500 }
    )
  }
}
