import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { resolveStaffPrincipal } from "@/lib/agent/context"
import { getAgentRuntimeInfo } from "@/lib/agent/model"
import { streamAgentResponse } from "@/lib/agent/stream"
import { db } from "@/lib/db"

// In-app chat surface. Same runtime, tools and policy as Telegram - only the
// transport differs. Streams UI messages for `useChat`.

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const threadKey = searchParams.get("threadKey") || `web:${user.id}`

  const thread = await db.agentThread.findUnique({
    where: { channel_threadKey: { channel: "web", threadKey } },
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: { id: true, role: true, content: true, createdAt: true },
      },
    },
  })

  // Only plain text turns are replayed into the UI; tool traffic stays in the
  // run log rather than cluttering the transcript on reload.
  const history = (thread?.messages || [])
    .filter((message) => message.content && (message.role === "user" || message.role === "assistant"))
    .map((message) => ({
      id: message.id,
      role: message.role,
      parts: [{ type: "text", text: message.content }],
    }))

  return NextResponse.json({
    success: true,
    data: { runtime: getAgentRuntimeInfo(), threadKey, history },
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
  const messages = Array.isArray(body.messages) ? body.messages : []

  if (!messages.length) {
    return NextResponse.json({ success: false, error: "messages are required" }, { status: 400 })
  }

  try {
    return await streamAgentResponse({
      principal,
      channel: "web",
      threadKey: body.threadKey ? String(body.threadKey) : `web:${user.id}`,
      uiMessages: messages,
      decidedByUserId: user.id,
      agentSlug: body.agentSlug ? String(body.agentSlug) : undefined,
      modelOverride: body.model ? String(body.model) : undefined,
    })
  } catch (error) {
    console.error("Agent chat failed:", error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Agent failed" },
      { status: 500 }
    )
  }
}
