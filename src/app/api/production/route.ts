import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { computeWorkCenterLoad } from "@/lib/manufacturing/routing"
import { getSettings } from "@/lib/settings/service"
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

      const existing = await db.productionOrder.findUnique({
        where: { id },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          companyId: true,
          _count: { select: { operations: true } },
        },
      })

      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Production order not found" },
          { status: 404 }
        )
      }

      // Read past the cache. getSettings memoises for a few seconds per module
      // instance, which is right for the hot read path but wrong here: these
      // two rules decide whether an action is refused, and an admin who turns
      // enforcement on expects the very next release to obey it — not the one
      // after the cache happens to expire. It also cannot be relied on across
      // instances, where each caches independently.
      const settings = await getSettings("manufacturing", {
        companyId: existing.companyId,
        skipCache: true,
      })

      // Off by default. Recipes that predate routings would otherwise all
      // become unreleasable the moment this shipped; a plant that has done the
      // work of writing its routings can turn it on and have the rule enforced.
      if (settings.requireRoutingToRelease && existing._count.operations === 0) {
        return NextResponse.json(
          {
            success: false,
            error: `${existing.orderNumber} has no routing. Add one to the recipe, or turn off "Require routing to release" in Manufacturing settings.`,
          },
          { status: 409 }
        )
      }

      // Releasing work onto a plant that is already full is the thing this
      // setting is about. Checked at release rather than at planning, because
      // planning is how you find out you are full.
      if (!settings.allowOverload) {
        const mine = await db.productionOperation.findMany({
          where: { productionOrderId: id, workCenterId: { not: null } },
          select: { workCenterId: true },
        })

        const centerIds = [...new Set(mine.map((row) => row.workCenterId as string))]

        if (centerIds.length) {
          const centers = await db.workCenter.findMany({
            where: { id: { in: centerIds } },
            select: {
              id: true,
              code: true,
              name: true,
              minutesPerDay: true,
              parallelCapacity: true,
              efficiencyPercent: true,
              costPerHour: true,
              setupMinutes: true,
            },
          })

          // Everything outstanding, including this run — releasing it is what
          // would tip the centre over.
          const outstanding = await db.productionOperation.findMany({
            where: { workCenterId: { in: centerIds }, status: { in: ["pending", "in_progress"] } },
            select: {
              workCenterId: true,
              scheduledStart: true,
              plannedSetupMinutes: true,
              plannedRunMinutes: true,
            },
          })

          const overloaded = computeWorkCenterLoad(centers, outstanding, settings).filter(
            (entry) => entry.overloaded
          )

          if (overloaded.length) {
            const worst = overloaded.sort((a, b) => b.utilisationPercent - a.utilisationPercent)[0]

            return NextResponse.json(
              {
                success: false,
                error: `${worst.code} is at ${worst.utilisationPercent}% over the next ${settings.capacityHorizonDays} days. Release anyway by allowing overload in Manufacturing settings.`,
                data: { overloaded },
              },
              { status: 409 }
            )
          }
        }
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

    if (action === "create_recipe") {
      const productId = String(body.productId || "")
      const name = String(body.name || "")
      const yieldQty = Number(body.yieldQty) || 1
      const yieldUnit = String(body.yieldUnit || "carton")
      const instructions = body.instructions ? String(body.instructions) : null
      const standardTimeMinutes = body.standardTimeMinutes ? Number(body.standardTimeMinutes) : null
      const lines = Array.isArray(body.lines) ? body.lines : []

      if (!productId || !name || lines.length === 0) {
        return NextResponse.json(
          { success: false, error: "productId, name, and at least one component line are required" },
          { status: 400 }
        )
      }

      const companyId = await getActiveCompanyId(request)
      const recipe = await db.billOfMaterial.create({
        data: {
          productId,
          name,
          yieldQty,
          yieldUnit,
          instructions,
          standardTimeMinutes,
          status: body.status || "active",
          companyId,
          lines: {
            create: lines.map((line: any, index: number) => ({
              componentId: String(line.componentId),
              quantity: Number(line.quantity) || 1,
              unit: String(line.unit || "each"),
              wastePercent: Number(line.wastePercent) || 0,
              sortOrder: line.sortOrder !== undefined ? Number(line.sortOrder) : index,
              // BomLine calls this `notes`; writing `instructions` made every
              // create_recipe call fail, since the field is sent on every line.
              notes: (line.notes ?? line.instructions)
                ? String(line.notes ?? line.instructions)
                : null,
            })),
          },
        },
        include: {
          product: { select: { name: true, sku: true } },
          lines: {
            include: { component: { select: { name: true, sku: true, baseUnit: true, costPrice: true } } },
          },
        },
      })

      return NextResponse.json({ success: true, data: recipe })
    }

    if (action === "update_recipe") {
      const id = String(body.id || "")
      if (!id) {
        return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
      }

      const updateData: Record<string, unknown> = {}
      if (body.name) updateData.name = String(body.name)
      if (body.yieldQty !== undefined) updateData.yieldQty = Number(body.yieldQty) || 1
      if (body.yieldUnit) updateData.yieldUnit = String(body.yieldUnit)
      if (body.instructions !== undefined) updateData.instructions = body.instructions ? String(body.instructions) : null
      if (body.standardTimeMinutes !== undefined) updateData.standardTimeMinutes = body.standardTimeMinutes ? Number(body.standardTimeMinutes) : null
      if (body.status) updateData.status = String(body.status)

      if (Array.isArray(body.lines)) {
        await db.$transaction(async (tx) => {
          await tx.bomLine.deleteMany({ where: { bomId: id } })
          await tx.billOfMaterial.update({
            where: { id },
            data: {
              ...updateData,
              lines: {
                create: body.lines.map((line: any, index: number) => ({
                  componentId: String(line.componentId),
                  quantity: Number(line.quantity) || 1,
                  unit: String(line.unit || "each"),
                  wastePercent: Number(line.wastePercent) || 0,
                  sortOrder: line.sortOrder !== undefined ? Number(line.sortOrder) : index,
                  instructions: line.instructions ? String(line.instructions) : null,
                })),
              },
            },
          })
        })
      } else {
        await db.billOfMaterial.update({
          where: { id },
          data: updateData,
        })
      }

      const recipe = await db.billOfMaterial.findUnique({
        where: { id },
        include: {
          product: { select: { name: true, sku: true } },
          lines: {
            include: { component: { select: { name: true, sku: true, baseUnit: true, costPrice: true } } },
          },
        },
      })

      return NextResponse.json({ success: true, data: recipe })
    }

    if (action === "delete_recipe") {
      const id = String(body.id || "")
      if (!id) {
        return NextResponse.json({ success: false, error: "id is required" }, { status: 400 })
      }

      const runsCount = await db.productionOrder.count({ where: { bomId: id } })
      if (runsCount > 0) {
        await db.billOfMaterial.update({
          where: { id },
          data: { status: "archived" },
        })
        return NextResponse.json({ success: true, message: "Recipe archived because production runs reference it" })
      }

      await db.billOfMaterial.delete({ where: { id } })
      return NextResponse.json({ success: true, message: "Recipe deleted" })
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
