import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { computeWorkCenterLoad } from "@/lib/manufacturing/routing"
import { ROLE_SETS } from "@/lib/permissions"
import { getSettings } from "@/lib/settings/service"

/**
 * Work centres.
 *
 * The list carries each centre's current load, because "do I have capacity"
 * is the question people open this screen to answer — making them click into
 * a second report to find out would be the wrong shape.
 */

export const dynamic = "force-dynamic"

const createSchema = z.object({
  code: z.string().trim().min(1).max(24),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullish(),
  warehouseId: z.string().nullish(),
  /** Null means inherit the manufacturing default rather than "no capacity". */
  minutesPerDay: z.number().int().min(1).max(1440).nullish(),
  parallelCapacity: z.number().int().min(1).max(100).optional(),
  efficiencyPercent: z.number().min(1).max(200).optional(),
  costPerHour: z.number().min(0).optional(),
  setupMinutes: z.number().int().min(0).optional(),
  status: z.enum(["active", "maintenance", "retired"]).optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.operations)
  if (!auth.user) return auth.response

  try {
    const companyId = await getActiveCompanyId(request)
    const settings = await getSettings("manufacturing", { companyId })

    const url = new URL(request.url)
    const includeRetired = url.searchParams.get("includeRetired") === "true"
    const horizonDays = Number(url.searchParams.get("horizonDays")) || settings.capacityHorizonDays

    const centers = await db.workCenter.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        ...(includeRetired ? {} : { status: { not: "retired" } }),
      },
      include: {
        warehouse: { select: { id: true, name: true } },
        _count: { select: { routingOperations: true, productionOperations: true } },
      },
      orderBy: { code: "asc" },
    })

    // Only work that is still outstanding occupies capacity; a finished
    // operation has already happened and would otherwise make every centre
    // look permanently full.
    const operations = await db.productionOperation.findMany({
      where: {
        workCenterId: { in: centers.map((center) => center.id) },
        status: { in: ["pending", "in_progress"] },
      },
      select: {
        workCenterId: true,
        scheduledStart: true,
        plannedSetupMinutes: true,
        plannedRunMinutes: true,
      },
    })

    const load = computeWorkCenterLoad(centers, operations, settings, horizonDays)
    const loadById = new Map(load.map((entry) => [entry.workCenterId, entry]))

    return NextResponse.json({
      success: true,
      data: centers.map((center) => ({
        ...center,
        // Spell out what the centre actually runs at once inheritance is applied,
        // so the UI never has to re-derive it.
        effectiveMinutesPerDay: center.minutesPerDay ?? settings.defaultMinutesPerDay,
        load: loadById.get(center.id) ?? null,
      })),
      meta: { horizonDays, settings },
    })
  } catch (error) {
    console.error("Failed to list work centres:", error)
    return NextResponse.json(
      { success: false, error: "Failed to load work centres" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "warehouse"])
  if (!auth.user) return auth.response

  try {
    const parsed = createSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid work centre" },
        { status: 400 }
      )
    }

    const companyId = await getActiveCompanyId(request)
    const input = parsed.data
    const code = input.code.toUpperCase()

    const clash = await db.workCenter.findFirst({
      where: { code, companyId: companyId ?? null },
      select: { id: true },
    })

    if (clash) {
      return NextResponse.json(
        { success: false, error: `Work centre "${code}" already exists` },
        { status: 409 }
      )
    }

    const center = await db.workCenter.create({
      data: {
        code,
        name: input.name,
        description: input.description ?? null,
        warehouseId: input.warehouseId || null,
        minutesPerDay: input.minutesPerDay ?? null,
        parallelCapacity: input.parallelCapacity ?? 1,
        // Store null, not today's default. A centre that says nothing keeps
        // following the settings, so changing the default moves every centre
        // that never overrode it — baking the number in at create time would
        // silently freeze each one at whatever the default happened to be.
        efficiencyPercent: input.efficiencyPercent ?? null,
        costPerHour: input.costPerHour ?? 0,
        setupMinutes: input.setupMinutes ?? null,
        status: input.status ?? "active",
        companyId: companyId ?? null,
      },
      include: { warehouse: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ success: true, data: center }, { status: 201 })
  } catch (error) {
    console.error("Failed to create work centre:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create work centre" },
      { status: 500 }
    )
  }
}
