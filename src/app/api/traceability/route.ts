import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"
import {
  lotDossier,
  planRecall,
  recordLotShipment,
  whatItBecame,
  whatWentIntoIt,
} from "@/lib/traceability/service"

/** Lot genealogy and recall scope. */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "warehouse", "sales"])
  if (auth.response) return auth.response

  const { searchParams } = new URL(request.url)
  const batchCode = (searchParams.get("batchCode") || "").trim()
  const view = searchParams.get("view") || "dossier"

  if (!batchCode) {
    return NextResponse.json({ success: false, error: "batchCode is required" }, { status: 400 })
  }

  try {
    if (view === "backward") {
      return NextResponse.json({ success: true, data: await whatWentIntoIt(batchCode) })
    }

    if (view === "forward") {
      return NextResponse.json({ success: true, data: await whatItBecame(batchCode) })
    }

    if (view === "recall") {
      return NextResponse.json({ success: true, data: await planRecall(batchCode) })
    }

    return NextResponse.json({ success: true, data: await lotDossier(batchCode) })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Trace failed" },
      { status: 500 }
    )
  }
}

/**
 * Records a lot shipment by hand.
 *
 * Dispatch writes these automatically. This exists for the cases dispatch
 * cannot see: a sample sent to a customer, a pallet collected from the dock,
 * a correction after someone shipped the wrong lot. Leaving those unrecorded
 * is what puts a hole in a recall.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "warehouse"])
  if (auth.response) return auth.response

  const body = await request.json().catch(() => ({}))

  if (String(body.action || "") !== "record-shipment") {
    return NextResponse.json(
      { success: false, error: 'Unknown action. Expected "record-shipment".' },
      { status: 400 }
    )
  }

  for (const field of ["batchCode", "productId", "orderId", "customerId"]) {
    if (!body[field]) {
      return NextResponse.json({ success: false, error: `${field} is required` }, { status: 400 })
    }
  }

  try {
    const result = await recordLotShipment({
      batchCode: String(body.batchCode),
      batchId: body.batchId ?? null,
      productId: String(body.productId),
      quantity: Number(body.quantity),
      orderId: String(body.orderId),
      orderItemId: body.orderItemId ?? null,
      customerId: String(body.customerId),
      shippedAt: body.shippedAt ? new Date(body.shippedAt) : undefined,
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to record" },
      { status: 500 }
    )
  }
}
