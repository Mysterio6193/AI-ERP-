import { NextRequest, NextResponse } from "next/server"

import { getActiveCompanyId } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import {
  defaultsFor,
  isNamespace,
  listNamespaces,
  REGISTRY,
} from "@/lib/settings/registry"
import {
  getSettings,
  isCustomised,
  resetSettings,
  saveSettings,
} from "@/lib/settings/service"

/**
 * Business settings.
 *
 * Reads are open to any staff member because most screens need them; writes are
 * restricted per namespace — tax and invoicing belong to accounts, numbering to
 * an admin.
 *
 * `scope=company` writes an override for the entity the user is acting as;
 * anything else writes the group-wide default.
 */

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ namespace: string }> }
) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts", "warehouse"])
  if (auth.response) {
    return auth.response
  }

  const { namespace } = await params

  // A discovery endpoint, so the UI does not hardcode the namespace list.
  if (namespace === "_index") {
    return NextResponse.json({ success: true, data: listNamespaces() })
  }

  if (!isNamespace(namespace)) {
    return NextResponse.json(
      { success: false, error: `Unknown settings namespace "${namespace}"` },
      { status: 404 }
    )
  }

  try {
    const companyId = await getActiveCompanyId(request)

    const [settings, customised] = await Promise.all([
      getSettings(namespace, { companyId }),
      isCustomised(namespace, companyId),
    ])

    return NextResponse.json({
      success: true,
      data: {
        namespace,
        label: REGISTRY[namespace].label,
        description: REGISTRY[namespace].description,
        settings,
        // So the UI can show "using defaults" rather than implying these values
        // were chosen by someone.
        defaults: defaultsFor(namespace),
        customised,
        canWrite: REGISTRY[namespace].writeRoles.includes(auth.user!.role),
      },
    })
  } catch (error) {
    console.error(`Failed to read settings "${namespace}":`, error)
    return NextResponse.json({ success: false, error: "Failed to load settings" }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ namespace: string }> }
) {
  const { namespace } = await params

  if (!isNamespace(namespace)) {
    return NextResponse.json(
      { success: false, error: `Unknown settings namespace "${namespace}"` },
      { status: 404 }
    )
  }

  const auth = await requireAdminUser(request, REGISTRY[namespace].writeRoles as never)
  if (auth.response) {
    return auth.response
  }

  const body = await request.json().catch(() => ({}))
  const patch = body.settings

  if (!patch || typeof patch !== "object") {
    return NextResponse.json({ success: false, error: "settings object is required" }, { status: 400 })
  }

  try {
    const companyId = body.scope === "company" ? await getActiveCompanyId(request) : null

    const result = await saveSettings(namespace, patch as Record<string, unknown>, {
      companyId,
      actorId: auth.user!.id,
    })

    return result.ok
      ? NextResponse.json({ success: true, data: result.settings })
      : NextResponse.json({ success: false, error: result.error }, { status: 400 })
  } catch (error) {
    console.error(`Failed to save settings "${namespace}":`, error)
    return NextResponse.json({ success: false, error: "Failed to save settings" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ namespace: string }> }
) {
  const { namespace } = await params

  if (!isNamespace(namespace)) {
    return NextResponse.json(
      { success: false, error: `Unknown settings namespace "${namespace}"` },
      { status: 404 }
    )
  }

  const auth = await requireAdminUser(request, REGISTRY[namespace].writeRoles as never)
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const companyId =
    searchParams.get("scope") === "company" ? await getActiveCompanyId(request) : null

  const settings = await resetSettings(namespace, { companyId, actorId: auth.user!.id })

  return NextResponse.json({ success: true, data: settings })
}
