import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import {
  completeProductionOrder,
  createProductionOrder,
  explodeBom,
  maxProducibleBatches,
  traceBatch,
} from "@/lib/manufacturing"

/** Recipes, production runs, and batch traceability. */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "warehouse", "sales"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const view = searchParams.get("view") || "overview"

  try {
    if (view === "recipes") {
      const recipes = await db.billOfMaterial.findMany({
        include: {
          product: { select: { name: true, sku: true } },
          lines: {
            orderBy: { sortOrder: "asc" },
            include: { component: { select: { name: true, sku: true, baseUnit: true, costPrice: true } } },
          },
          _count: { select: { productionOrders: true } },
        },
        orderBy: { createdAt: "asc" },
      })

      // Capacity per recipe, so the list answers "what can we make today".
      const withCapacity = await Promise.all(
        recipes.map(async (recipe) => {
          const capacity = await maxProducibleBatches(recipe.id)

          return {
            ...recipe,
            capacity: capacity.ok
              ? { batches: capacity.batches, outputQty: capacity.outputQty, limitedBy: capacity.limitedBy }
              : null,
          }
        })
      )

      return NextResponse.json({ success: true, data: withCapacity })
    }

    if (view === "explode") {
      const bomId = searchParams.get("bomId")
      const batches = Number(searchParams.get("batches")) || 1

      if (!bomId) {
        return NextResponse.json({ success: false, error: "bomId is required" }, { status: 400 })
      }

      const result = await explodeBom(bomId, batches, searchParams.get("warehouseId") || undefined)

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    if (view === "trace") {
      const batchCode = searchParams.get("batchCode")

      if (!batchCode) {
        return NextResponse.json({ success: false, error: "batchCode is required" }, { status: 400 })
      }

      return NextResponse.json({ success: true, data: await traceBatch(batchCode) })
    }

    // Default: the runs board.
    const orders = await db.productionOrder.findMany({
      include: {
        product: { select: { name: true, sku: true } },
        bom: { select: { name: true } },
        consumptions: {
          include: { component: { select: { name: true, sku: true } } },
        },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 50,
    })

    return NextResponse.json({ success: true, data: orders })
  } catch (error) {
    console.error("Production read failed:", error)
    return NextResponse.json({ success: false, error: "Failed to load production" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || "")

  try {
    if (action === "plan") {
      const bomId = String(body.bomId || "")
      const batches = Number(body.batches) || 1

      if (!bomId) {
        return NextResponse.json({ success: false, error: "bomId is required" }, { status: 400 })
      }

      // Default to the company's default warehouse so a run always has
      // somewhere to move stock; completing without one is refused.
      const warehouseId =
        body.warehouseId ||
        (
          await db.warehouse.findFirst({
            where: { isDefault: true },
            select: { id: true },
          })
        )?.id

      const result = await createProductionOrder({
        bomId,
        batches,
        warehouseId: warehouseId || undefined,
        scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : undefined,
        notes: body.notes ? String(body.notes) : undefined,
        createdById: auth.user!.id,
        companyId: await getActiveCompanyId(request),
      })

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    if (action === "start") {
      const id = String(body.id || "")
      if (!id) {
        return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
      }

      const order = await db.productionOrder.update({
        where: { id },
        data: { status: "in_progress", startedAt: new Date() },
      })

      return NextResponse.json({ success: true, data: order })
    }

    if (action === "complete") {
      const id = String(body.id || "")
      const producedQty = Number(body.producedQty)

      if (!id || !Number.isFinite(producedQty)) {
        return NextResponse.json(
          { success: false, error: "id and producedQty are required" },
          { status: 400 }
        )
      }

      const result = await completeProductionOrder({
        productionOrderId: id,
        producedQty,
        rejectedQty: Number(body.rejectedQty) || 0,
        actuals: Array.isArray(body.actuals) ? body.actuals : undefined,
        userId: auth.user!.id,
      })

      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true, data: result })
    }

    if (action === "cancel") {
      const id = String(body.id || "")
      const order = await db.productionOrder.findUnique({ where: { id }, select: { status: true } })

      if (order?.status === "completed") {
        return NextResponse.json(
          { success: false, error: "This run is completed — stock has already moved" },
          { status: 400 }
        )
      }

      await db.productionOrder.update({ where: { id }, data: { status: "cancelled" } })
      return NextResponse.json({ success: true, data: { id } })
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}"` }, { status: 400 })
  } catch (error) {
    console.error(`Production action ${action} failed:`, error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Action failed" },
      { status: 500 }
    )
  }
}
