"use client"

import { AgentDock } from "@/components/agent/agent-dock"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "./app-sidebar"
import { Header } from "./header"
import { type UserRole } from "@/lib/types"

interface AppShellProps {
  children: React.ReactNode
  title?: string
  breadcrumbs?: { label: string; href?: string }[]
  user?: {
    name: string
    email: string
    role: UserRole
    avatar?: string
  }
}

export function AppShell({ children, title, breadcrumbs, user }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset className="bg-background min-h-screen flex flex-col">
        <Header title={title} breadcrumbs={breadcrumbs} />
        <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            {children}
          </div>
        </main>
        <AgentDock />
      </SidebarInset>
    </SidebarProvider>
  )
}
