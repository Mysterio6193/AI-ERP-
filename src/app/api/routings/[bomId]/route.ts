import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { scheduleRouting } from "@/lib/manufacturing/routing"
import { ROLE_SETS } from "@/lib/permissions"
import { getSettings } from "@/lib/settings/service"

/**
 * A recipe's routing: the ordered steps that turn its inputs into its output.
 *
 * The whole routing is replaced on save rather than patched step by step.
 * Reordering, inserting and deleting steps in one screen is the normal edit,
 * and a diff-based endpoint would make the client responsible for getting that
 * right. The write runs in a transaction so a half-applied routing is not a
 * state the system can be left in.
 */

export const dynamic = "force-dynamic"

const stepSchema = z.object({
  sequence: z.number().int().min(1).max(100000),
  name: z.string().trim().min(1).max(120),
  workCenterId: z.string().nullish(),
  setupMinutes: z.number().int().min(0).max(100000).nullish(),
  runMinutesPerUnit: z.number().min(0).max(100000).optional(),
  queueMinutes: z.number().int().min(0).max(100000).nullish(),
  moveMinutes: z.number().int().min(0).max(100000).nullish(),
  scrapPercent: z.number().min(0).max(99.9).optional(),
  instructions: z.string().trim().max(4000).nullish(),
})

const saveSchema = z.object({
  steps: z.array(stepSchema).max(100),
  /** Quantity to price the preview at. Defaults to the recipe's own yield. */
  previewQty: z.number().min(0).optional(),
})

async function loadRouting(bomId: string, previewQty: number | undefined, companyId: string | null) {
  const bom = await db.billOfMaterial.findUnique({
    where: { id: bomId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      routing: {
        include: { workCenter: { select: { id: true, code: true, name: true } } },
        orderBy: { sequence: "asc" },
      },
    },
  })

  if (!bom) return null

  const settings = await getSettings("manufacturing", { companyId })

  const centers = await db.workCenter.findMany({
    where: { ...(companyId ? { companyId } : {}), status: { not: "retired" } },
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

  const qty = previewQty && previewQty > 0 ? previewQty : bom.yieldQty

  return {
    bom: {
      id: bom.id,
      name: bom.name,
      version: bom.version,
      product: bom.product,
      yieldQty: bom.yieldQty,
      yieldUnit: bom.yieldUnit,
      standardTimeMinutes: bom.standardTimeMinutes,
    },
    steps: bom.routing,
    schedule: scheduleRouting(bom.routing, qty, settings, centers),
    previewQty: qty,
    workCenters: centers,
    settings,
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ bomId: string }> }
) {
  const auth = await requireAdminUser(request, ROLE_SETS.operations)
  if (!auth.user) return auth.response

  const { bomId } = await params
  const previewQty = Number(new URL(request.url).searchParams.get("qty")) || undefined

  try {
    const result = await loadRouting(bomId, previewQty, await getActiveCompanyId(request))

    if (!result) {
      return NextResponse.json({ success: false, error: "Recipe not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Failed to load routing:", error)
    return NextResponse.json({ success: false, error: "Failed to load routing" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ bomId: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "warehouse"])
  if (!auth.user) return auth.response

  const { bomId } = await params

  try {
    const parsed = saveSchema.safeParse(await request.json())

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid routing" },
        { status: 400 }
      )
    }

    const bom = await db.billOfMaterial.findUnique({ where: { id: bomId }, select: { id: true } })

    if (!bom) {
      return NextResponse.json({ success: false, error: "Recipe not found" }, { status: 404 })
    }

    const { steps } = parsed.data

    // Caught here rather than at the database, so the message names the problem
    // instead of surfacing a unique-constraint error.
    const sequences = steps.map((step) => step.sequence)
    const duplicate = sequences.find((value, index) => sequences.indexOf(value) !== index)

    if (duplicate !== undefined) {
      return NextResponse.json(
        { success: false, error: `Two steps share sequence ${duplicate}` },
        { status: 400 }
      )
    }

    const referenced = steps.map((step) => step.workCenterId).filter((id): id is string => !!id)

    if (referenced.length) {
      const found = await db.workCenter.findMany({
        where: { id: { in: referenced } },
        select: { id: true },
      })

      if (found.length !== new Set(referenced).size) {
        return NextResponse.json(
          { success: false, error: "A step points at a work centre that no longer exists" },
          { status: 400 }
        )
      }
    }

    await db.$transaction(async (tx) => {
      await tx.routingOperation.deleteMany({ where: { bomId } })

      if (steps.length) {
        await tx.routingOperation.createMany({
          data: steps.map((step) => ({
            bomId,
            sequence: step.sequence,
            name: step.name,
            workCenterId: step.workCenterId || null,
            // Null, not 0. A step that states nothing must keep inheriting the
            // work centre's figure; writing 0 here reads back as "this step
            // genuinely has no setup" and silently drops the inheritance.
            setupMinutes: step.setupMinutes ?? null,
            queueMinutes: step.queueMinutes ?? null,
            moveMinutes: step.moveMinutes ?? null,
            // These two have no work-centre-level default to fall back to, so
            // an unstated value really is zero.
            runMinutesPerUnit: step.runMinutesPerUnit ?? 0,
            scrapPercent: step.scrapPercent ?? 0,
            instructions: step.instructions ?? null,
          })),
        })
      }
    })

    const result = await loadRouting(bomId, parsed.data.previewQty, await getActiveCompanyId(request))

    // Keep the recipe's headline time in step with its routing, so the older
    // scheduling path that reads standardTimeMinutes does not drift from the
    // routing that now supersedes it.
    if (result) {
      await db.billOfMaterial.update({
        where: { id: bomId },
        data: { standardTimeMinutes: Math.round(result.schedule.totalElapsedMinutes) || null },
      })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Failed to save routing:", error)
    return NextResponse.json({ success: false, error: "Failed to save routing" }, { status: 500 })
  }
}
