import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { resolveStaffPrincipal } from "@/lib/agent/context"
import { decide, getThresholds } from "@/lib/agent/policy"
import { buildTools, TOOL_POLICY } from "@/lib/agent/tools"

/**
 * Tool inspection and dry-run.
 *
 * Lets a human list the tools a principal actually has, and invoke one directly
 * with the policy engine still in front of it. Useful for verifying a tool's
 * query without spending a model call, and for confirming that a write really
 * is gated before trusting the agent with it.
 */

export async function GET(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const principal = await resolveStaffPrincipal(user.id)
  if (!principal) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const tools = buildTools(principal, "web")
  const thresholds = await getThresholds()

  const rows = Object.keys(tools)
    .sort()
    .map((name) => {
      const meta = TOOL_POLICY[name]
      const decision = decide({ toolName: name, meta, value: undefined, principal, thresholds })

      return {
        name,
        risk: meta?.risk ?? "unclassified",
        roles: meta?.roles ?? null,
        valueField: meta?.valueField ?? null,
        // What would happen if the agent called this with no monetary value.
        defaultDecision: decision.type,
        reason: decision.type === "allow" ? null : decision.reason,
      }
    })

  return NextResponse.json({
    success: true,
    data: { principal: { role: principal.role, name: principal.name }, thresholds, tools: rows },
  })
}

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const principal = await resolveStaffPrincipal(user.id)
  if (!principal) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const name = String(body.name || "")
  const args = (body.args || {}) as Record<string, unknown>

  const tools = buildTools(principal, "web")
  const tool = tools[name]

  if (!tool || typeof tool.execute !== "function") {
    return NextResponse.json(
      { success: false, error: `No tool named "${name}" is available to you` },
      { status: 404 }
    )
  }

  const meta = TOOL_POLICY[name]
  const thresholds = await getThresholds()
  const value = meta?.valueField ? Number(args[meta.valueField]) : undefined

  const decision = decide({
    toolName: name,
    meta,
    value: Number.isFinite(value) ? Math.abs(value as number) : undefined,
    principal,
    thresholds,
  })

  // A dry run must not become a way around the approval queue.
  if (decision.type !== "allow") {
    return NextResponse.json({
      success: true,
      data: { executed: false, decision: decision.type, reason: decision.reason },
    })
  }

  try {
    const started = Date.now()
    const result = await tool.execute(args, {
      toolCallId: `dry-run-${Date.now()}`,
      messages: [],
    } as never)

    return NextResponse.json({
      success: true,
      data: { executed: true, ms: Date.now() - started, result },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Tool failed" },
      { status: 500 }
    )
  }
}
