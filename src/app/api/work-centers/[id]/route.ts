import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  code: z.string().trim().min(1).max(24).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullish(),
  warehouseId: z.string().nullish(),
  minutesPerDay: z.number().int().min(1).max(1440).nullish(),
  parallelCapacity: z.number().int().min(1).max(100).optional(),
  efficiencyPercent: z.number().min(1).max(200).nullish(),
  costPerHour: z.number().min(0).optional(),
  setupMinutes: z.number().int().min(0).nullish(),
  status: z.enum(["active", "maintenance", "retired"]).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.operations)
  if (!auth.user) return auth.response

  const { id } = await params

  const center = await db.workCenter.findUnique({
    where: { id },
    include: {
      warehouse: { select: { id: true, name: true } },
      routingOperations: {
        include: { bom: { select: { id: true, name: true, product: { select: { name: true } } } } },
        orderBy: { sequence: "asc" },
      },
    },
  })

  if (!center) {
    return NextResponse.json({ success: false, error: "Work centre not found" }, { status: 404 })
  }

  return NextResponse.json({ success: true, data: center })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "warehouse"])
  if (!auth.user) return auth.response

  const { id } = await params

  try {
    const parsed = updateSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid work centre" },
        { status: 400 }
      )
    }

    const existing = await db.workCenter.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    })

    if (!existing) {
      return NextResponse.json({ success: false, error: "Work centre not found" }, { status: 404 })
    }

    const input = parsed.data
    const code = input.code ? input.code.toUpperCase() : undefined

    if (code) {
      const clash = await db.workCenter.findFirst({
        where: { code, companyId: existing.companyId, NOT: { id } },
        select: { id: true },
      })

      if (clash) {
        return NextResponse.json(
          { success: false, error: `Work centre "${code}" already exists` },
          { status: 409 }
        )
      }
    }

    const center = await db.workCenter.update({
      where: { id },
      data: {
        ...(code ? { code } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description ?? null } : {}),
        ...(input.warehouseId !== undefined ? { warehouseId: input.warehouseId || null } : {}),
        ...(input.minutesPerDay !== undefined ? { minutesPerDay: input.minutesPerDay ?? null } : {}),
        ...(input.parallelCapacity !== undefined ? { parallelCapacity: input.parallelCapacity } : {}),
        ...(input.efficiencyPercent !== undefined ? { efficiencyPercent: input.efficiencyPercent ?? null } : {}),
        ...(input.costPerHour !== undefined ? { costPerHour: input.costPerHour } : {}),
        ...(input.setupMinutes !== undefined ? { setupMinutes: input.setupMinutes ?? null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: { warehouse: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ success: true, data: center })
  } catch (error) {
    console.error("Failed to update work centre:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update work centre" },
      { status: 500 }
    )
  }
}

/**
 * Retires a work centre rather than deleting it once it has history.
 *
 * Deleting one that routings or finished runs point at would either fail on the
 * foreign key or blank out what a completed run was made on. Retiring keeps the
 * record readable and takes it out of the pick lists.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "warehouse"])
  if (!auth.user) return auth.response

  const { id } = await params

  try {
    const center = await db.workCenter.findUnique({
      where: { id },
      select: {
        id: true,
        _count: { select: { routingOperations: true, productionOperations: true } },
      },
    })

    if (!center) {
      return NextResponse.json({ success: false, error: "Work centre not found" }, { status: 404 })
    }

    const used = center._count.routingOperations + center._count.productionOperations

    if (used > 0) {
      const retired = await db.workCenter.update({
        where: { id },
        data: { status: "retired" },
      })

      return NextResponse.json({
        success: true,
        data: retired,
        message: `Retired instead of deleted — ${used} routing step${used === 1 ? "" : "s"} and run${used === 1 ? "" : "s"} still reference it.`,
      })
    }

    await db.workCenter.delete({ where: { id } })

    return NextResponse.json({ success: true, message: "Work centre deleted" })
  } catch (error) {
    console.error("Failed to delete work centre:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete work centre" },
      { status: 500 }
    )
  }
}
