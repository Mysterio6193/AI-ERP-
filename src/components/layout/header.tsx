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
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground md:hidden" />
      
      <div className="flex flex-1 items-center gap-4">
        {breadcrumbs ? (
          <Breadcrumb>
            <BreadcrumbList>
              {breadcrumbs.map((crumb, index) => (
                <BreadcrumbItem key={index}>
                  {crumb.href ? (
                    <Link href={crumb.href} className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                      {crumb.label}
                    </Link>
                  ) : (
                    <BreadcrumbPage className="text-sm font-semibold text-foreground">{crumb.label}</BreadcrumbPage>
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
          <p className="text-xl font-semibold tracking-tight text-foreground">{title || "Dashboard"}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search resources, SKUs, customers... (⌘K)"
            className="h-9 w-80 bg-background/50 pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-1"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:bg-accent hover:text-foreground">
              <Bell className="h-4 w-4" />
              {notifications.length > 0 ? (
                <Badge className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-0 bg-primary px-1 text-[10px] text-primary-foreground">
                  {notifications.length}
                </Badge>
              ) : null}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-xl border border-border bg-popover p-2 shadow-lg">
            <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Notifications & Alerts
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {loadingNotifications ? (
              <DropdownMenuItem className="flex items-center gap-2 rounded-lg p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Refreshing alerts...</span>
              </DropdownMenuItem>
            ) : notifications.length === 0 ? (
              <DropdownMenuItem className="flex flex-col items-start gap-1 rounded-lg p-3">
                <span className="font-medium text-sm text-foreground">All clear</span>
                <span className="text-xs text-muted-foreground">
                  There are no urgent inventory, order, or receivables alerts right now.
                </span>
              </DropdownMenuItem>
            ) : (
              notifications.map((notification) => (
                <DropdownMenuItem key={notification.id} asChild>
                  <Link href={notification.href} className="flex flex-col items-start gap-1 rounded-lg p-2.5 transition-colors hover:bg-accent">
                    <span className="flex items-center gap-2">
                      <span className="font-medium text-xs text-foreground">{notification.title}</span>
                      <span
                        className={`inline-block h-2 w-2 rounded-full ${
                          notification.tone === "critical"
                            ? "bg-destructive"
                            : notification.tone === "warning"
                              ? "bg-amber-500"
                              : "bg-blue-500"
                        }`}
                      />
                    </span>
                    <span className="text-xs text-muted-foreground line-clamp-2">
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
