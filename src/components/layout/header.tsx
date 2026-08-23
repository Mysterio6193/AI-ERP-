"use client"

import { useEffect, useState } from "react"
import { Bell, Loader2, Search } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage } from "@/components/ui/breadcrumb"

interface HeaderProps {
  title?: string
  breadcrumbs?: { label: string; href?: string }[]
}

interface HeaderNotification {
  id: string
  title: string
  description: string
  href: string
  tone: "critical" | "warning" | "info"
}

export function Header({ title, breadcrumbs }: HeaderProps) {
  const [notifications, setNotifications] = useState<HeaderNotification[]>([])
  const [loadingNotifications, setLoadingNotifications] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadNotifications() {
      try {
        const response = await fetch("/api/dashboard/notifications", { cache: "no-store" })
        const payload = await response.json()

        if (!isMounted) {
          return
        }

        setNotifications(payload?.success ? payload.data || [] : [])
      } catch (error) {
        console.error("Failed to load header notifications:", error)
        if (isMounted) {
          setNotifications([])
        }
      } finally {
        if (isMounted) {
          setLoadingNotifications(false)
        }
      }
    }

    void loadNotifications()
    const intervalId = window.setInterval(() => {
      void loadNotifications()
    }, 30000)

    return () => {
      isMounted = false
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-white/8 bg-black/82 px-4 backdrop-blur-[20px] md:px-6">
      <SidebarTrigger className="text-white hover:bg-white/10 hover:text-white md:hidden" />
      
      <div className="flex flex-1 items-center gap-4">
        {breadcrumbs ? (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <BreadcrumbItem key={index}>
                  {crumb.href ? (
                    <Link href={crumb.href} className="text-sm text-white/64 hover:text-white">
                      {crumb.label}
                    </Link>
                  ) : (
                    <BreadcrumbPage className="text-white">{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        ) : (
          // Not an <h1>. Every one of the 49 pages already declares its own,
          // so this made each page carry two — and the text usually repeats
          // the page heading a few pixels below it, which a screen reader then
          // announces twice. Styling is unchanged; only the semantics move.
          <p className="text-[28px] font-semibold tracking-[-0.028em] text-white">{title || "Dashboard"}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/48" />
          <Input
            type="search"
            placeholder="Search..."
            className="h-10 w-72 border-white/10 bg-white/8 pl-11 text-white placeholder:text-white/44"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-white hover:bg-white/10 hover:text-white">
              <Bell className="h-5 w-5" />
              {notifications.length > 0 ? (
                <Badge className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-0 bg-primary p-0 text-[11px] text-white">
                  {notifications.length}
                </Badge>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[22rem] rounded-[1.5rem] border border-black/8 bg-white p-2 shadow-[rgba(0,0,0,0.14)_0_16px_38px]">
            <DropdownMenuLabel className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Notifications
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {loadingNotifications ? (
              <DropdownMenuItem className="flex items-center gap-2 rounded-xl p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Refreshing alerts...</span>
              </DropdownMenuItem>
            ) : notifications.length === 0 ? (
              <DropdownMenuItem className="flex flex-col items-start gap-1 rounded-xl p-3">
                <span className="font-medium text-sm">All clear</span>
                <span className="text-xs text-muted-foreground">
                  There are no urgent inventory, order, or receivables alerts right now.
                </span>
              </DropdownMenuItem>
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem key={notification.id} asChild>
                  <Link href={notification.href} className="flex flex-col items-start gap-1 rounded-xl p-3 hover:bg-[#f5f5f7]">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-sm">{notification.title}</span>
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-full ${
                          notification.tone === "critical"
                            ? "bg-red-500"
                            : notification.tone === "warning"
                              ? "bg-amber-500"
                              : "bg-blue-500"
                        }`}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {notification.description}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
