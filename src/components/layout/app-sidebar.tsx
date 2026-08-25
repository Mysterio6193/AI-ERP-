"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  CalendarDays,
  Contact2,
  Inbox,
  LayoutDashboard,
  Package,
  Users,
  ShoppingCart,
  Warehouse,
  FileText,
  BarChart3,
  Settings,
  LogOut,
  Building2,
  ChevronDown,
  Truck,
  Route,
  DollarSign,
  UserCircle,
  ClipboardList,
  Receipt,
  Building,
  Sparkles,
  BookOpen,
  CreditCard,
  PiggyBank,
  Webhook,
  Globe,
  History,
  Landmark,
  FolderTree,
  Heart,
  Megaphone,
  Check,
  Factory,
  Brain,
  GraduationCap,
  MessagesSquare,
  SlidersHorizontal,
  RotateCcw,
  Radio,
  ScanLine,
  Zap,
  Bot,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { type UserRole } from "@/lib/types"
import { getCompanyDisplayName, type CompanyBranding } from "@/lib/company-branding"
import { useAgentIdentity } from "@/lib/agent/use-agent-identity"

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  badge?: number
  roles: UserRole[]
  group?: string
}

/** One legal entity in the group. Admins can act as any of them. */
interface GroupEntity {
  id: string
  name: string
  tradingName: string | null
  abn: string | null
}

const navItems: NavItem[] = [
  // Dashboard
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    roles: ["admin", "sales", "warehouse", "accounts", "driver"],
    group: "Overview",
  },
  {
    label: "Grok Bot",
    href: "/grok-bot",
    icon: Zap,
    roles: ["admin", "sales", "warehouse", "accounts", "driver"],
    group: "Overview",
  },

  // Sales Group
  {
    label: "Commerce",
    href: "/commerce",
    icon: Globe,
    roles: ["admin", "sales"],
    group: "Sales & CRM",
  },
  {
    label: "Quotes",
    href: "/quotes",
    icon: Receipt,
    roles: ["admin", "sales"],
    group: "Sales & CRM",
  },
  {
    label: "Sales Orders",
    href: "/orders",
    icon: ShoppingCart,
    roles: ["admin", "sales", "warehouse", "driver"],
    group: "Sales & CRM",
  },
  {
    label: "Inbox",
    href: "/inbox",
    icon: Inbox,
    roles: ["admin", "sales", "accounts"],
    group: "Overview",
  },
  {
    label: "CRM",
    href: "/crm",
    icon: Contact2,
    roles: ["admin", "sales", "accounts"],
    group: "Sales & CRM",
  },
  {
    label: "Marketing",
    href: "/marketing",
    icon: Megaphone,
    roles: ["admin", "sales"],
    group: "Sales & CRM",
  },
  {
    label: "Agents",
    href: "/settings/agents",
    icon: Sparkles,
    roles: ["admin"],
    group: "Setup",
  },
  {
    label: "Memory",
    href: "/settings/memory",
    icon: Brain,
    roles: ["admin", "sales", "accounts", "warehouse"],
    group: "Setup",
  },
  {
    label: "Skills",
    href: "/settings/skills",
    icon: GraduationCap,
    roles: ["admin", "sales", "accounts", "warehouse"],
    group: "Setup",
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Users,
    roles: ["admin", "sales", "accounts"],
    group: "Sales & CRM",
  },
  {
    label: "Credit Applications",
    href: "/credit-applications",
    icon: FileText,
    roles: ["admin", "sales", "accounts"],
    group: "Sales & CRM",
  },
  {
    label: "Wishlists",
    href: "/wishlists",
    icon: Heart,
    roles: ["admin", "sales"],
    group: "Sales & CRM",
  },

  // Purchasing Group
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Building,
    roles: ["admin", "warehouse"],
    group: "Purchasing",
  },
  {
    label: "Purchase Orders",
    href: "/purchase-orders",
    icon: ClipboardList,
    roles: ["admin", "warehouse"],
    group: "Purchasing",
  },
  {
    label: "OCR & Document Scanner",
    href: "/documents/scan",
    icon: ScanLine,
    roles: ["admin", "warehouse", "sales", "accounts"],
    group: "Purchasing",
  },

  // Inventory Group
  {
    label: "Production",
    href: "/production",
    icon: Factory,
    roles: ["admin", "warehouse"],
    group: "Production",
  },
  {
    label: "Products",
    href: "/products",
    icon: Package,
    roles: ["admin", "sales", "warehouse"],
    group: "Production",
  },
  {
    label: "Categories",
    href: "/categories",
    icon: FolderTree,
    roles: ["admin", "sales", "warehouse"],
    group: "Production",
  },
  {
    label: "Inventory",
    href: "/inventory",
    icon: Warehouse,
    roles: ["admin", "warehouse"],
    group: "Inventory",
  },
  {
    label: "Locations",
    href: "/warehouses",
    icon: Building2,
    roles: ["admin", "warehouse"],
    group: "Inventory",
  },
  {
    label: "Pricing",
    href: "/pricing",
    icon: DollarSign,
    roles: ["admin", "sales"],
    group: "Production",
  },
  {
    label: "Stock Movements",
    href: "/inventory/movements",
    icon: History,
    roles: ["admin", "warehouse", "accounts"],
    group: "Inventory",
  },

  // Fulfillment Group
  {
    label: "Pick Queue",
    href: "/warehouse/picking",
    icon: Warehouse,
    roles: ["admin", "warehouse"],
    group: "Fulfilment",
  },
  {
    // Reads across every module, so it sits with fulfilment rather than
    // inside any one of them.
    label: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    roles: ["admin", "sales", "warehouse", "driver", "accounts"],
    group: "Fulfilment",
  },
  {
    label: "Routes & Delivery",
    href: "/routes",
    icon: Truck,
    roles: ["admin", "warehouse", "driver"],
    group: "Fulfilment",
  },
  {
    label: "Carriers",
    href: "/carriers",
    icon: Truck,
    roles: ["admin", "warehouse", "sales"],
    group: "Fulfilment",
  },
  {
    label: "Returns",
    href: "/returns",
    icon: RotateCcw,
    roles: ["admin", "warehouse", "sales", "accounts"],
    group: "Fulfilment",
  },

  // Finance Group
  {
    label: "Finance Overview",
    href: "/finance",
    icon: PiggyBank,
    roles: ["admin", "accounts"],
    group: "Finance",
  },
  {
    label: "Invoices",
    href: "/invoices",
    icon: FileText,
    roles: ["admin", "accounts", "sales"],
    group: "Finance",
  },
  {
    label: "Customer Statements",
    href: "/customers/statements",
    icon: Receipt,
    roles: ["admin", "accounts", "sales"],
    group: "Finance",
  },
  {
    label: "Banking",
    href: "/finance/banking",
    icon: Building2,
    roles: ["admin", "accounts"],
    group: "Finance",
  },
  {
    label: "Expenses",
    href: "/finance/expenses",
    icon: CreditCard,
    roles: ["admin", "accounts"],
    group: "Finance",
  },
  {
    label: "General Ledger",
    href: "/finance/ledger",
    icon: BookOpen,
    roles: ["admin", "accounts"],
    group: "Finance",
  },
  {
    label: "Chart of Accounts",
    href: "/finance/chart-of-accounts",
    icon: Landmark,
    roles: ["admin", "accounts"],
    group: "Finance",
  },
  {
    label: "Reconciliation",
    href: "/finance/reconciliation",
    icon: History,
    roles: ["admin", "accounts"],
    group: "Finance",
  },

  // AI
  {
    label: "AI Assistant",
    href: "/ai",
    icon: Sparkles,
    roles: ["admin", "sales", "accounts"],
    group: "Overview",
  },

  // Reports
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    roles: ["admin", "sales", "accounts"],
    group: "Overview",
  },
  {
    label: "History",
    href: "/settings/history",
    icon: MessagesSquare,
    roles: ["admin", "sales", "accounts", "warehouse"],
    group: "Overview",
  },

  // Settings
  {
    label: "Business Settings",
    href: "/settings/business",
    icon: SlidersHorizontal,
    roles: ["admin", "accounts", "warehouse"],
    group: "Setup",
  },
  {
    label: "Telegram & Bot",
    href: "/settings/agent",
    icon: Radio,
    roles: ["admin"],
    group: "Setup",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["admin"],
    group: "Setup",
  },
  {
    label: "Users",
    href: "/users",
    icon: UserCircle,
    roles: ["admin"],
    group: "Setup",
  },
  {
    label: "API & Integrations",
    href: "/integrations",
    icon: Webhook,
    roles: ["admin"],
    group: "Setup",
  },
]

interface AppSidebarProps {
  user?: {
    name: string
    email: string
    role: UserRole
    avatar?: string
  }
}

export function AppSidebar({ user }: AppSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [company, setCompany] = useState<CompanyBranding | null>(null)
  const [sessionUser, setSessionUser] = useState<AppSidebarProps["user"] | null>(user || null)
  const [entities, setEntities] = useState<GroupEntity[]>([])
  const [activeEntityId, setActiveEntityId] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    const fetchSidebarData = async () => {
      try {
        const [companyResponse, sessionResponse, entityResponse] = await Promise.all([
          fetch("/api/settings/company"),
          fetch("/api/admin/session"),
          fetch("/api/companies"),
        ])

        const [companyData, sessionData, entityData] = await Promise.all([
          companyResponse.json(),
          sessionResponse.json(),
          entityResponse.json(),
        ])

        if (companyData.success) {
          setCompany(companyData.data)
        }

        if (entityData.success) {
          setEntities(entityData.data.companies)
          setActiveEntityId(entityData.data.activeId)
        }

        if (sessionData.success && sessionData.data?.authenticated && sessionData.data.user) {
          setSessionUser(sessionData.data.user)
        } else if (!user) {
          router.replace("/signin")
        }
      } catch (error) {
        console.error("Error fetching sidebar data:", error)
      }
    }

    void fetchSidebarData()
  }, [router, user])

  const agentIdentity = useAgentIdentity()

  const currentUser = sessionUser

  const filteredNavItems = currentUser
    ? navItems
        .filter((item) => item.roles.includes(currentUser.role))
        // The agent has a name; the sidebar should use it rather than calling
        // it "AI Assistant" while it introduces itself as something else.
        .map((item) =>
          item.href === "/ai" ? { ...item, label: agentIdentity.name } : item
        )
    : []

  // Group items
  const groupedItems = filteredNavItems.reduce((acc, item) => {
    const group = item.group || "Main"
    if (!acc[group]) acc[group] = []
    acc[group].push(item)
    return acc
  }, {} as Record<string, NavItem[]>)

  // Top-level modules, in the order the business actually works:
  // see what is happening, sell it, make it, hold it, buy it, ship it, bank it.
  const groupOrder = [
    "Overview",
    "Sales & CRM",
    "Production",
    "Inventory",
    "Purchasing",
    "Fulfilment",
    "Finance",
    "Setup",
  ]

  async function handleLogout() {
    try {
      await fetch("/api/admin/session", {
        method: "DELETE",
      })
    } catch (error) {
      console.error("Failed to log out", error)
    } finally {
      setSessionUser(null)
      router.replace("/signin")
      router.refresh()
    }
  }

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <SidebarHeader className="border-b border-sidebar-border/70 p-4">
        <Link href="/" className="flex items-center gap-3 px-1 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-blue-600 text-primary-foreground shadow-md shadow-primary/25 ring-1 ring-white/20 transition-transform group-hover:scale-105">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="truncate text-sm font-bold tracking-tight text-sidebar-foreground group-hover:text-primary transition-colors">{getCompanyDisplayName(company)}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              <span className="text-[9px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">SupplySure OS</span>
            </div>
          </div>
        </Link>

        {/* Only a group billing from more than one entity needs a switcher. */}
        {entities.length > 1 ? (
          <div className="mt-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={switching}
                  className="flex w-full items-center justify-between gap-2 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/40 px-3 py-1.5 text-left transition-all hover:bg-sidebar-accent hover:border-primary/30 disabled:opacity-60 shadow-xs"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium text-sidebar-foreground">
                      {entities.find((entity) => entity.id === activeEntityId)?.tradingName ||
                        entities.find((entity) => entity.id === activeEntityId)?.name ||
                        "Select entity"}
                    </span>
                    <span className="block text-[10px] text-sidebar-foreground/50">
                      Entity · {entities.length} in group
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 border border-border bg-popover text-popover-foreground shadow-xl rounded-xl">
                {entities.map((entity) => (
                  <DropdownMenuItem
                    key={entity.id}
                    disabled={switching || entity.id === activeEntityId}
                    onSelect={async () => {
                      if (entity.id === activeEntityId) return
                      setSwitching(true)

                      try {
                        const response = await fetch("/api/companies", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ companyId: entity.id }),
                        })

                        if ((await response.json()).success) {
                          setActiveEntityId(entity.id)
                          router.refresh()
                          window.location.reload()
                        }
                      } finally {
                        setSwitching(false)
                      }
                    }}
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-medium">
                        {entity.tradingName || entity.name}
                      </span>
                      {entity.abn ? (
                        <span className="text-[10px] text-muted-foreground">ABN {entity.abn}</span>
                      ) : null}
                    </div>
                    {entity.id === activeEntityId ? (
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto px-2.5 py-3 space-y-1">
        {groupOrder.map((group) => {
          const items = groupedItems[group]
          if (!items || items.length === 0) return null

          return (
            <SidebarGroup key={group} className="py-1">
              {group !== "Main" && (
                <SidebarGroupLabel className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
                  {group}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu className="space-y-0.5">
                  {items.map((item) => {
                    const isActive = pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href))
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={`
                            w-full justify-start gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-all duration-150
                            ${isActive
                              ? "bg-primary/15 text-primary border border-primary/25 shadow-sm shadow-primary/10 font-semibold"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                            }
                          `}
                        >
                          <Link href={item.href}>
                            <item.icon className={`h-4 w-4 shrink-0 transition-transform ${isActive ? "text-primary scale-105" : "text-sidebar-foreground/60"}`} />
                            <span className="truncate">{item.label}</span>
                            {item.badge ? (
                              <Badge className="ml-auto h-4 px-1.5 text-[10px] font-semibold border-0 bg-primary/20 text-primary">
                                {item.badge}
                              </Badge>
                            ) : null}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="w-full justify-start gap-2.5 rounded-md px-2.5 py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground">
                  <Avatar className="h-7 w-7 border border-sidebar-border">
                    <AvatarImage src={currentUser?.avatar} />
                    <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-xs font-medium">
                      {(currentUser?.name || "SU")
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left min-w-0 flex-1">
                    <span className="truncate text-xs font-medium text-sidebar-foreground">
                      {currentUser?.name || "User account"}
                    </span>
                    <span className="truncate text-[10px] capitalize text-sidebar-foreground/50">
                      {currentUser?.role || "session"}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
              >
                <DropdownMenuItem className="cursor-pointer" asChild>
                  <Link href="/users">
                    <UserCircle className="mr-2 h-4 w-4" />
                    Staff & Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer" asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive" onClick={() => void handleLogout()}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
