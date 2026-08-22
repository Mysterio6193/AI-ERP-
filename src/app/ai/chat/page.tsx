"use client"

import { AgentChat } from "@/components/agent/agent-chat"
import { AppShell } from "@/components/layout/app-shell"

export default function AgentChatPage() {
  return (
    <AppShell title="Agent">
      <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-3xl flex-col">
        <div className="pb-4">
          <h1 className="text-2xl font-semibold tracking-tight">Agent</h1>
          <p className="text-sm text-muted-foreground">
            Ask about the business, or tell it what to do. Actions over your limits come back for
            approval.
          </p>
        </div>

        <AgentChat />
      </div>
    </AppShell>
  )
}
