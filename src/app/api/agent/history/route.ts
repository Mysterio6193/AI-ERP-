import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { resolveStaffPrincipal } from "@/lib/agent/context"
import { readThread, searchHistory } from "@/lib/agent/history"
import { summariseThread } from "@/lib/agent/summarise"
import { db } from "@/lib/db"

/**
 * Conversation archive.
 *
 * Scoping lives in `lib/agent/history`, keyed off the principal, so this route
 * cannot widen it by forgetting a filter.
 */

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const principal = await resolveStaffPrincipal(user.id)
  if (!principal) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get("q") || "").trim()
  const threadId = searchParams.get("threadId")

  try {
    if (threadId) {
      const result = await readThread(principal, threadId)

      return result.ok
        ? NextResponse.json({ success: true, data: result })
        : NextResponse.json({ success: false, error: result.error }, { status: 404 })
    }

    if (query) {
      const afterDays = Number(searchParams.get("afterDays")) || 0

      return NextResponse.json({
        success: true,
        data: await searchHistory(principal, {
          query,
          after: afterDays ? new Date(Date.now() - afterDays * 86400_000) : undefined,
          limit: 20,
        }),
      })
    }

    // No query: the recent conversations, so the page is useful before typing.
    const threads = await db.agentThread.findMany({
      where: { persona: { not: "customer" } },
      orderBy: { lastMessageAt: "desc" },
      take: 25,
      select: {
        id: true,
        channel: true,
        persona: true,
        title: true,
        summary: true,
        lastMessageAt: true,
        _count: { select: { messages: true } },
      },
    })

    return NextResponse.json({
      success: true,
      data: threads.map((thread) => ({
        threadId: thread.id,
        channel: thread.channel,
        persona: thread.persona,
        title: thread.title,
        summary: thread.summary,
        lastMessageAt: thread.lastMessageAt,
        messageCount: thread._count.messages,
        excerpts: [],
        score: 0,
      })),
    })
  } catch (error) {
    console.error("History read failed:", error)
    return NextResponse.json({ success: false, error: "Failed to search" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const threadId = String(body.threadId || "")

  if (!threadId) {
    return NextResponse.json({ success: false, error: "threadId is required" }, { status: 400 })
  }

  const result = await summariseThread(threadId)

  return result.ok
    ? NextResponse.json({ success: true, data: result.thread })
    : NextResponse.json({ success: false, error: result.error }, { status: 400 })
}
