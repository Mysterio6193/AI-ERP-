"use client"

import { useEffect, useState } from "react"
import {
  Bell,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Loader2,
  Moon,
  Package,
  Search,
  ShoppingCart,
  Sparkles,
  Sun,
  Truck,
  Users,
  Warehouse,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
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
import { useThemeToggle } from "@/hooks/use-theme-toggle"

export const NOTIF_CACHE_KEY = "header_notifs_v1"

export interface HeaderNotification {
  id: string
  title: string
  description: string
  href: string
  tone: "critical" | "warning" | "info"
}

export type SearchResultKind =
  | "customer"
  | "order"
  | "product"
  | "invoice"
  | "supplier"
  | "purchase-order"

export interface SearchResultItem {
  kind: SearchResultKind
  label: string
  sub: string
  href: string
}

export function readNotificationCache(): HeaderNotification[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.sessionStorage.getItem(NOTIF_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (error) {
    console.error("Failed to read notification cache from sessionStorage:", error)
    return []
  }
}

export function writeNotificationCache(data: HeaderNotification[]) {
  if (typeof window === "undefined") return
  try {
    window.sessionStorage.setItem(NOTIF_CACHE_KEY, JSON.stringify(data))
  } catch (error) {
    console.error("Failed to write notification cache to sessionStorage:", error)
  }
}

const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard },
  { label: "Orders", href: "/orders", icon: ShoppingCart },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Products", href: "/products", icon: Package },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Purchase Orders", href: "/purchase-orders", icon: ClipboardList },
  { label: "Suppliers", href: "/suppliers", icon: Building2 },
  { label: "Inventory", href: "/inventory", icon: Warehouse },
  { label: "Routes", href: "/routes", icon: Truck },
  { label: "Quotes", href: "/quotes", icon: FileText },
]

interface HeaderProps {
  title?: string
  breadcrumbs?: { label: string; href?: string }[]
}

export function Header({ title, breadcrumbs }: HeaderProps) {
  const router = useRouter()
  const [notifications, setNotifications] = useState<HeaderNotification[]>(() => readNotificationCache())
  const [loadingNotifications, setLoadingNotifications] = useState(() => {
    if (typeof window === "undefined") return true
    try {
      return !window.sessionStorage.getItem(NOTIF_CACHE_KEY)
    } catch {
      return true
    }
  })

  const [cmdOpen, setCmdOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchResultItem[]>([])

  const { isDark, toggle: toggleTheme, mounted: themeMounted } = useThemeToggle()

  // ⌘K keyboard shortcut to open/close Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCmdOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [])

  // Debounced search query (300ms)
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
        if (response.ok) {
          const payload = await response.json()
          setResults(payload?.results || [])
        } else {
          setResults([])
        }
      } catch (error) {
        console.error("Failed to fetch search results:", error)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  // Periodic notification fetch
  useEffect(() => {
    let isMounted = true

    async function loadNotifications() {
      try {
        const response = await fetch("/api/dashboard/notifications", { cache: "no-store" })
        const payload = await response.json()

        if (!isMounted) {
          return
        }

        const fresh = payload?.success && Array.isArray(payload.data) ? payload.data : []
        setNotifications(fresh)
        writeNotificationCache(fresh)
      } catch (error) {
        console.error("Failed to load header notifications:", error)
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

  const handleSelect = (href: string) => {
    setCmdOpen(false)
    setQuery("")
    router.push(href)
  }

  const handleAskAI = () => {
    setCmdOpen(false)
    setQuery("")
    document.dispatchEvent(new CustomEvent("open-agent"))
  }

  const customerResults = results.filter((r) => r.kind === "customer")
  const orderResults = results.filter((r) => r.kind === "order")
  const productResults = results.filter((r) => r.kind === "product")
  const invoiceResults = results.filter((r) => r.kind === "invoice")
  const supplierResults = results.filter((r) => r.kind === "supplier")
  const poResults = results.filter((r) => r.kind === "purchase-order")

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/80 bg-background/80 px-4 backdrop-blur-xl md:px-6">
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
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold tracking-tight text-foreground">{title || "Operations Command Center"}</h1>
            <div className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              </span>
              <span>AI Core Live</span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Command Palette Trigger */}
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="relative hidden h-9 w-64 items-center justify-between rounded-xl border border-border/80 bg-card/60 px-3 text-xs text-muted-foreground transition-all duration-150 hover:border-primary/40 hover:bg-card/90 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary/40 md:flex shadow-sm"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">Search orders, SKUs, customers...</span>
          </span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-0.5 rounded border border-border/60 bg-muted/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
            <span className="text-[10px]">⌘</span>K
          </kbd>
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCmdOpen(true)}
          className="text-muted-foreground hover:bg-accent hover:text-foreground md:hidden rounded-xl"
          aria-label="Open search palette"
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Dark Mode Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={themeMounted && isDark ? "Switch to light theme" : "Switch to dark theme"}
        >
          {themeMounted ? (
            isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )
          ) : (
            <Sun className="h-4 w-4 opacity-0" />
          )}
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Open notifications">
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

      {/* Command Palette Dialog */}
      <CommandDialog open={cmdOpen} onOpenChange={setCmdOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Search customers, orders, products, invoices, suppliers..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.trim().length === 0 && (
            <CommandGroup heading="Navigate">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                return (
                  <CommandItem
                    key={item.href}
                    value={item.label}
                    onSelect={() => handleSelect(item.href)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )}

          {query.trim().length === 1 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search...
            </div>
          )}

          {query.trim().length >= 2 && (
            <>
              {searching ? (
                <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Searching...</span>
                </div>
              ) : results.length === 0 ? (
                <CommandEmpty>No results found for &ldquo;{query}&rdquo;</CommandEmpty>
              ) : (
                <>
                  {customerResults.length > 0 && (
                    <CommandGroup heading="Customers">
                      {customerResults.map((item) => (
                        <CommandItem
                          key={item.href}
                          value={`customer-${item.label}-${item.sub}`}
                          onSelect={() => handleSelect(item.href)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{item.label}</span>
                          </div>
                          {item.sub && (
                            <span className="text-xs text-muted-foreground">{item.sub}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {orderResults.length > 0 && (
                    <CommandGroup heading="Sales Orders">
                      {orderResults.map((item) => (
                        <CommandItem
                          key={item.href}
                          value={`order-${item.label}-${item.sub}`}
                          onSelect={() => handleSelect(item.href)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{item.label}</span>
                          </div>
                          {item.sub && (
                            <span className="text-xs text-muted-foreground">{item.sub}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {productResults.length > 0 && (
                    <CommandGroup heading="Products">
                      {productResults.map((item) => (
                        <CommandItem
                          key={item.href}
                          value={`product-${item.label}-${item.sub}`}
                          onSelect={() => handleSelect(item.href)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{item.label}</span>
                          </div>
                          {item.sub && (
                            <span className="text-xs text-muted-foreground">{item.sub}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {invoiceResults.length > 0 && (
                    <CommandGroup heading="Invoices">
                      {invoiceResults.map((item) => (
                        <CommandItem
                          key={item.href}
                          value={`invoice-${item.label}-${item.sub}`}
                          onSelect={() => handleSelect(item.href)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{item.label}</span>
                          </div>
                          {item.sub && (
                            <span className="text-xs text-muted-foreground">{item.sub}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {supplierResults.length > 0 && (
                    <CommandGroup heading="Suppliers">
                      {supplierResults.map((item) => (
                        <CommandItem
                          key={item.href}
                          value={`supplier-${item.label}-${item.sub}`}
                          onSelect={() => handleSelect(item.href)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{item.label}</span>
                          </div>
                          {item.sub && (
                            <span className="text-xs text-muted-foreground">{item.sub}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}

                  {poResults.length > 0 && (
                    <CommandGroup heading="Purchase Orders">
                      {poResults.map((item) => (
                        <CommandItem
                          key={item.href}
                          value={`po-${item.label}-${item.sub}`}
                          onSelect={() => handleSelect(item.href)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <ClipboardList className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">{item.label}</span>
                          </div>
                          {item.sub && (
                            <span className="text-xs text-muted-foreground">{item.sub}</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="AI Assistant">
            <CommandItem
              value="ask-ai-action"
              onSelect={handleAskAI}
              className="flex items-center gap-2 cursor-pointer text-primary"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">Ask AI...</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </header>
  )
}
