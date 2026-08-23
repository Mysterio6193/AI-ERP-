"use client"

import { Bot, Sparkles } from "lucide-react"

import { AgentChat } from "@/components/agent/agent-chat"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"

export default function AgentChatPage() {
  return (
    <AppShell title="AI Agent" breadcrumbs={[{ label: "AI Copilot", href: "/ai" }, { label: "Agent Chat" }]}>
      <div className="mx-auto flex h-[calc(100vh-8.5rem)] w-full max-w-5xl flex-col space-y-4 pb-2">
        <PageHeader
          title="AI Operations Agent"
          description="Query business intelligence, automate operational tasks, and execute actions with policy guardrails."
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 flex items-center gap-1.5 py-1 px-3">
                <Sparkles className="h-3.5 w-3.5" />
                Live Model Ready
              </Badge>
            </div>
          }
        />

        <Card className="flex flex-1 flex-col overflow-hidden border-border shadow-sm">
          <CardContent className="flex-1 p-4 md:p-6 overflow-hidden">
            <AgentChat />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}

