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
        {/*
          The assistant button is fixed at bottom-6 right-6 and is 48px tall,
          so anything in the last ~96px of a page sat underneath it and could
          not be clicked — on the dashboard that was the Route board's own
          "Open delivery" link. The extra bottom padding gives every page room
          to scroll clear of it.
        */}
        <main className="flex-1 overflow-auto px-4 pb-28 pt-4 md:px-6 md:pb-28 md:pt-5">
          <div className="mx-auto w-full max-w-[1600px]">
            {children}
          </div>
        </main>
        <AgentDock />
      </SidebarInset>
    </SidebarProvider>
  )
}
