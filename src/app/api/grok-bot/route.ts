import { NextRequest, NextResponse } from "next/server"

import { buildTools } from "@/lib/agent/tools"
import { db } from "@/lib/db"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, payload } = body

    // Authenticate / find default staff principal
    const adminUser = await db.user.findFirst({ where: { role: "admin" } })
    if (!adminUser) {
      return NextResponse.json({ error: "No staff user found" }, { status: 401 })
    }

    const principal = {
      // StaffPrincipal carries identity, not company — the acting entity is
      // resolved per request, not baked into the principal.
      kind: "staff" as const,
      userId: adminUser.id,
      name: adminUser.name,
      email: adminUser.email,
      role: "admin" as const,
    }

    const tools = buildTools(principal, "grok_studio")

    if (action === "think_reasoning") {
      const tool = tools.grokDeepReasoner
      if (!tool?.execute) {
        return NextResponse.json(
          { success: false, error: "The grokDeepReasoner tool is not available for this principal." },
          { status: 404 }
        )
      }

      const result = await tool.execute({
        complexQuestion: payload.question || "Optimize RDM Pizza Australia manufacturing and wholesale distribution margins.",
        domainContext: payload.domain || "general",
      }, {} as never)
      return NextResponse.json(result)
    }

    if (action === "chief_of_staff_mobilize") {
      const tool = tools.chiefOfStaffOrchestrator
      if (!tool?.execute) {
        return NextResponse.json(
          { success: false, error: "The chiefOfStaffOrchestrator tool is not available for this principal." },
          { status: 404 }
        )
      }

      const result = await tool.execute({
        missionDirective: payload.mission || "Mobilize team to prepare Sydney distribution and audit weekly ledger.",
        participatingTeammates: payload.teammates,
      }, {} as never)
      return NextResponse.json(result)
    }

    if (action === "market_trend_radar") {
      const tool = tools.xaiMarketTrendRadar
      if (!tool?.execute) {
        return NextResponse.json(
          { success: false, error: "The xaiMarketTrendRadar tool is not available for this principal." },
          { status: 404 }
        )
      }

      const result = await tool.execute({
        categoryFocus: payload.category || "pizza_crust_trends",
      }, {} as never)
      return NextResponse.json(result)
    }

    if (action === "execute_macro") {
      const tool = tools.demonstrateWorkflowMacro
      if (!tool?.execute) {
        return NextResponse.json(
          { success: false, error: "The demonstrateWorkflowMacro tool is not available for this principal." },
          { status: 404 }
        )
      }

      const result = await tool.execute({
        macroName: payload.name || "Default Operations Routine",
        description: payload.description || "Automated ERP workflow",
        trigger: payload.trigger || "manual",
        demonstratedSteps: payload.steps || ["Verify inventory", "Dispatch routes", "Notify accounts"],
      }, {} as never)
      return NextResponse.json(result)
    }

    if (action === "simulate_what_if") {
      const tool = tools.simulateWhatIfScenario
      if (!tool?.execute) {
        return NextResponse.json(
          { success: false, error: "The simulateWhatIfScenario tool is not available for this principal." },
          { status: 404 }
        )
      }

      const result = await tool.execute({
        scenarioType: payload.scenarioType || "supplier_cost_increase",
        percentageDelta: payload.percentageDelta || 15,
        affectedEntity: payload.affectedEntity,
      }, {} as never)
      return NextResponse.json(result)
    }

    if (action === "autopilot_sweep") {
      const tool = tools.operationsAutoPilotSweep
      if (!tool?.execute) {
        return NextResponse.json(
          { success: false, error: "The operationsAutoPilotSweep tool is not available for this principal." },
          { status: 404 }
        )
      }

      const result = await tool.execute({}, {} as never)
      return NextResponse.json(result)
    }

    return NextResponse.json({ error: "Invalid action specified" }, { status: 400 })
  } catch (error) {
    console.error("Grok Bot API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    )
  }
}
