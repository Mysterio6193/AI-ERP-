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
  UserPlus,
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
    label: "Accounts",
    href: "/crm/accounts",
    icon: Building2,
    roles: ["admin", "sales", "accounts"],
    group: "Sales & CRM",
  },
  {
    label: "Leads",
    href: "/crm/leads",
    icon: UserPlus,
    roles: ["admin", "sales"],
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
    <Sidebar className="border-r-0 bg-black text-white">
      <SidebarHeader className="border-b border-white/8 p-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6 backdrop-blur">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-[19px] font-semibold tracking-[-0.026em] text-white">{getCompanyDisplayName(company)}</span>
            <span className="text-[11px] uppercase tracking-[0.12em] text-white/45">SupplySure OS</span>
          </div>
        </Link>

        {/* Only a group billing from more than one entity needs a switcher. */}
        {entities.length > 1 ? (
          <div className="mt-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={switching}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10 disabled:opacity-60"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-medium text-white">
                      {entities.find((entity) => entity.id === activeEntityId)?.tradingName ||
                        entities.find((entity) => entity.id === activeEntityId)?.name ||
                        "Select entity"}
                    </span>
                    <span className="block text-[10px] text-white/40">
                      Billing entity · {entities.length} in group
                    </span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/40" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
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
                          // Server components and cached reads are scoped to the
                          // old entity, so a refresh is required, not cosmetic.
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
                      <Check className="ml-auto h-3.5 w-3.5 shrink-0" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent className="overflow-y-auto px-3 py-4">
        {groupOrder.map((group) => {
          const items = groupedItems[group]
          if (!items || items.length === 0) return null

          return (
            <SidebarGroup key={group}>
              {group !== "Main" && (
                <SidebarGroupLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/38">
                  {group}
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => {
                    const isActive = pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href))
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          className={`
                            w-full justify-start gap-3 rounded-2xl px-4 py-3 text-[14px] font-medium tracking-[-0.014em]
                            transition-all duration-200
                            ${isActive
                              ? "bg-white text-black shadow-[rgba(255,255,255,0.12)_0_6px_24px] hover:bg-white"
                              : "text-white/68 hover:bg-white/8 hover:text-white"
                            }
                          `}
                        >
                          <Link href={item.href}>
                            <item.icon className="h-4 w-4" />
                            <span>{item.label}</span>
                            {item.badge && (
                              <Badge className="ml-auto border-0 bg-primary text-white text-[11px]">
                                {item.badge}
                              </Badge>
                            )}
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
      <SidebarFooter className="border-t border-white/8 p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="w-full justify-start gap-3 rounded-2xl px-3 py-3 text-white/72 hover:bg-white/8 hover:text-white">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={currentUser?.avatar} />
                    <AvatarFallback className="bg-white/10 text-white text-sm">
                      {(currentUser?.name || "SU")
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col items-start text-left">
                    <span className="text-sm font-medium text-white">
                      {currentUser?.name || "Loading account"}
                    </span>
                    <span className="text-xs capitalize text-white/42">
                      {currentUser?.role || "session"}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto h-4 w-4 text-white/42" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 rounded-[1.5rem] border border-white/8 bg-[#1d1d1f] text-white shadow-[rgba(0,0,0,0.3)_0_16px_40px]"
              >
                <DropdownMenuItem className="rounded-xl hover:bg-white/10 focus:bg-white/10" asChild>
                  <Link href="/users">
                  <UserCircle className="mr-2 h-4 w-4" />
                  Staff & Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-xl hover:bg-white/10 focus:bg-white/10" asChild>
                  <Link href="/settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/8" />
                <DropdownMenuItem className="rounded-xl text-red-300 hover:bg-white/10 focus:bg-white/10" onClick={() => void handleLogout()}>
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
