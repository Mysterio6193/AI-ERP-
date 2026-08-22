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
      <SidebarInset className="bg-[#f5f5f7]">
        <Header title={title} breadcrumbs={breadcrumbs} />
        <main className="flex-1 overflow-auto px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
        <AgentDock />
      </SidebarInset>
    </SidebarProvider>
  )
}
