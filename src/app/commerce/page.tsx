"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Globe,
  Smartphone,
  Megaphone,
  RefreshCw,
  Save,
  ShoppingBag,
  TrendingUp,
  ShieldCheck,
  ExternalLink,
  Boxes,
  Sparkles,
  Headset,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  COMMERCE_CHANNEL_COLORS,
  COMMERCE_CHANNEL_LABELS,
  DEFAULT_COMMERCE_SETTINGS,
  type CommerceSettingsShape,
} from "@/lib/commerce"
import { formatCurrencyShort, formatDate } from "@/lib/types"

interface CommerceOrder {
  id: string
  orderNumber: string
  sourceChannel: "customer_web" | "customer_app" | "admin"
  customerName: string
  customerEmail?: string | null
  totalAmount: number
  status: string
  orderDate: string
  itemCount: number
  latestStatusNote?: string | null
}

interface CommerceOverviewResponse {
  overview: {
    totalCustomerOrders: number
    last30DaysOrders: number
    customerRevenue: number
    last30DaysRevenue: number
    activeChannels: string[]
    liveCustomers: number
    channelBreakdown: Array<{
      channel: "customer_web" | "customer_app"
      label: string
      orders: number
      revenue: number
    }>
    statusBreakdown: Array<{
      status: string
      count: number
    }>
  }
  settings?: Partial<CommerceSettingsShape> | null
  orders: CommerceOrder[]
}

function ReadinessBadge({
  label,
  ready,
}: {
  label: string
  ready: boolean
}) {
  return (
    <Badge variant={ready ? "default" : "outline"} className={ready ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" : "text-muted-foreground border-border"}>
      {label}: {ready ? "Ready" : "Needs setup"}
    </Badge>
  )
}

export default function CommercePage() {
  const [overview, setOverview] = useState<CommerceOverviewResponse | null>(null)
  const [settings, setSettings] = useState<CommerceSettingsShape>(DEFAULT_COMMERCE_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadCommerce = async (background = false) => {
    try {
      if (background) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const [overviewRes, settingsRes] = await Promise.all([
        fetch("/api/commerce/overview"),
        fetch("/api/settings/commerce"),
      ])

      const overviewData = await overviewRes.json()
      const settingsData = await settingsRes.json()

      if (!overviewData.success || !settingsData.success) {
        throw new Error("Unable to load commerce data")
      }

      setOverview(overviewData.data)
      setSettings({
        ...DEFAULT_COMMERCE_SETTINGS,
        ...(settingsData.data || {}),
      })
    } catch (error) {
      console.error(error)
      toast.error("Unable to load commerce controls")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void loadCommerce()
  }, [])

  const deploymentChecks = useMemo(() => {
    return {
      website: Boolean(settings.websiteEnabled && settings.websiteUrl),
      mobile:
        Boolean(settings.mobileAppEnabled && (settings.playStoreUrl || settings.appStoreUrl)),
      support: Boolean(settings.supportEmail || settings.supportPhone),
      content: Boolean(settings.heroTitle && settings.primaryCtaLabel),
    }
  }, [settings])

  const handleSave = async () => {
    try {
      setSaving(true)
      const response = await fetch("/api/settings/commerce", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Unable to save commerce settings")
      }

      setSettings({
        ...DEFAULT_COMMERCE_SETTINGS,
        ...(data.data || {}),
      })
      toast.success("Commerce controls updated")
      void loadCommerce(true)
    } catch (error) {
      console.error(error)
      toast.error("Unable to save commerce settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppShell title="Commerce" breadcrumbs={[{ label: "Commerce" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Commerce Control Center"
          description="Manage customer website and mobile app channels, ordering policies, and operational sync."
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => void loadCommerce(true)} disabled={refreshing || loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={handleSave} disabled={saving || loading}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save Commerce"}
              </Button>
            </div>
          }
        />

        <div className="flex flex-wrap gap-2">
          <ReadinessBadge label="Website" ready={deploymentChecks.website} />
          <ReadinessBadge label="Mobile App" ready={deploymentChecks.mobile} />
          <ReadinessBadge label="Support Contact" ready={deploymentChecks.support} />
          <ReadinessBadge label="Storefront Content" ready={deploymentChecks.content} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Total Customer Orders"
            value={loading ? "..." : overview?.overview.totalCustomerOrders || 0}
            description={`${overview?.overview.last30DaysOrders || 0} placed in the last 30 days`}
            icon={ShoppingBag}
          />
          <KpiCard
            title="Commerce Revenue"
            value={loading ? "..." : formatCurrencyShort(overview?.overview.customerRevenue || 0)}
            description={`${formatCurrencyShort(overview?.overview.last30DaysRevenue || 0)} in the last 30 days`}
            icon={TrendingUp}
          />
          <KpiCard
            title="Website Orders"
            value={loading ? "..." : overview?.overview.channelBreakdown.find((item) => item.channel === "customer_web")?.orders || 0}
            description={`Website flow currently ${settings.websiteEnabled ? "enabled" : "disabled"}`}
            icon={Globe}
          />
          <KpiCard
            title="Mobile App Orders"
            value={loading ? "..." : overview?.overview.channelBreakdown.find((item) => item.channel === "customer_app")?.orders || 0}
            description={`${overview?.overview.liveCustomers || 0} active customer accounts`}
            icon={Smartphone}
          />
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="orders">Customer Orders</TabsTrigger>
            <TabsTrigger value="operations">Operations</TabsTrigger>
            <TabsTrigger value="settings">Storefront Controls</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_1.25fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Channel performance</CardTitle>
                  <CardDescription>Website and app orders flowing into the same operations engine.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(overview?.overview.channelBreakdown || []).map((item) => (
                    <div key={item.channel} className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{item.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.orders} order{item.orders === 1 ? "" : "s"} tracked in OS
                          </p>
                        </div>
                        <Badge className={COMMERCE_CHANNEL_COLORS[item.channel]}>
                          {COMMERCE_CHANNEL_LABELS[item.channel]}
                        </Badge>
                      </div>
                      <p className="mt-4 text-2xl font-semibold text-foreground">
                        {formatCurrencyShort(item.revenue)}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Launch checklist</CardTitle>
                  <CardDescription>Deployment details that ops and growth teams usually need before go-live.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-primary" />
                      <p className="font-medium text-foreground">Customer website</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{settings.websiteUrl || "No production URL saved yet."}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 text-emerald-600" />
                      <p className="font-medium text-foreground">Customer mobile app</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.playStoreUrl || settings.appStoreUrl || "No App Store / Play Store URL saved yet."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Megaphone className="h-4 w-4 text-amber-600" />
                      <p className="font-medium text-foreground">Announcement bar</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.announcementEnabled && settings.announcementText
                        ? settings.announcementText
                        : "Announcement bar is currently off."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-violet-600" />
                      <p className="font-medium text-foreground">Commerce safety</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.maintenanceMode
                        ? "Maintenance mode is on, so customers should be blocked from ordering."
                        : "Channels are open for ordering."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Headset className="h-4 w-4 text-emerald-600" />
                      <p className="font-medium text-foreground">Support handoff</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.supportEmail || settings.supportPhone
                        ? `${settings.supportEmail || "No support email"}${settings.supportPhone ? ` • ${settings.supportPhone}` : ""}`
                        : "No support contact saved yet."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-pink-600" />
                      <p className="font-medium text-foreground">Storefront CTA</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.primaryCtaLabel
                        ? `${settings.primaryCtaLabel} -> ${settings.primaryCtaHref || "/"}`
                        : "No primary CTA configured yet."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                      <p className="font-medium text-foreground">Order thresholds</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Minimum order {formatCurrencyShort(settings.minimumOrderAmount || 0)}. Free delivery from {formatCurrencyShort(settings.freeDeliveryThreshold || 0)}.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <Headset className="h-4 w-4 text-emerald-600" />
                      <p className="font-medium text-foreground">Support hours</p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.supportHours || "No support hours configured yet."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Commerce pulse</CardTitle>
                  <CardDescription>Live demand and order movement across customer channels.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-foreground">
                      <ShoppingBag className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">Live customers</p>
                    </div>
                    <p className="mt-3 text-2xl font-semibold">{overview?.overview.liveCustomers || 0}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Customers with sessions or carts in OS</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-foreground">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      <p className="text-sm font-medium">30-day revenue</p>
                    </div>
                    <p className="mt-3 text-2xl font-semibold">
                      {formatCurrencyShort(overview?.overview.last30DaysRevenue || 0)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Commerce revenue booked in the last 30 days</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-foreground">
                      <Boxes className="h-4 w-4 text-amber-600" />
                      <p className="text-sm font-medium">Featured categories</p>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-foreground">
                      {settings.featuredCategoryIds || "No featured category ids configured"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Comma-separated category ids for merchandising</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Go-live links</CardTitle>
                  <CardDescription>Jump straight to the public surfaces managed from this page.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <a
                    href={settings.websiteUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors ${settings.websiteUrl ? "hover:bg-muted/50" : "pointer-events-none opacity-60"}`}
                  >
                    <div>
                      <p className="font-medium text-foreground">Customer website</p>
                      <p className="text-sm text-muted-foreground">{settings.websiteUrl || "Add website URL to enable"}</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                  <a
                    href={settings.playStoreUrl || settings.appStoreUrl || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className={`flex items-center justify-between rounded-xl border border-border bg-card p-4 transition-colors ${(settings.playStoreUrl || settings.appStoreUrl) ? "hover:bg-muted/50" : "pointer-events-none opacity-60"}`}
                  >
                    <div>
                      <p className="font-medium text-foreground">Mobile app listing</p>
                      <p className="text-sm text-muted-foreground">
                        {settings.playStoreUrl || settings.appStoreUrl || "Add App Store / Play Store URL to enable"}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </a>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            <Card className="border-border shadow-sm overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">Customer channel orders</CardTitle>
                <CardDescription>Orders from the website and app flow here for fulfilment and finance.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Loading customer orders...
                        </TableCell>
                      </TableRow>
                    ) : !overview?.orders.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          No customer website or app orders yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      overview.orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <div className="font-mono font-medium">{order.orderNumber}</div>
                            <div className="text-xs text-muted-foreground">{order.itemCount} items</div>
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{order.customerName}</div>
                            <div className="text-xs text-muted-foreground">{order.customerEmail || "No email saved"}</div>
                          </TableCell>
                          <TableCell>
                            <Badge className={COMMERCE_CHANNEL_COLORS[order.sourceChannel]}>
                              {COMMERCE_CHANNEL_LABELS[order.sourceChannel]}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDate(order.orderDate)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrencyShort(order.totalAmount)}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant="outline" className="border-border text-foreground">
                                {order.status}
                              </Badge>
                              {order.latestStatusNote ? (
                                <p className="text-xs text-muted-foreground">{order.latestStatusNote}</p>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operations" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Order status mix</CardTitle>
                  <CardDescription>How customer-channel orders are currently moving through operations.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overview?.overview.statusBreakdown.length ? (
                    overview.overview.statusBreakdown.map((item) => (
                      <div key={item.status} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                        <div>
                          <p className="font-medium text-foreground">{item.status}</p>
                          <p className="text-xs text-muted-foreground">Customer website and app orders</p>
                        </div>
                        <Badge variant="outline" className="border-border text-foreground">
                          {item.count}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      No customer-channel orders have hit the dashboard yet.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Storefront policy summary</CardTitle>
                  <CardDescription>Operational toggles that shape the customer buying experience.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-medium text-foreground">Order approval</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.autoApproveOrders
                        ? "Customer orders go straight into fulfilment."
                        : "Customer orders stop in pending approval before ops picks them."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-medium text-foreground">Inventory sync</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.inventorySyncEnabled
                        ? "Storefront inventory stays aligned with SupplySure OS stock."
                        : "Inventory sync is disabled for storefront channels."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-medium text-foreground">Out-of-stock behavior</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.showOutOfStock
                        ? "Out-of-stock items can still appear in the storefront experience."
                        : "Out-of-stock items are hidden from the storefront experience."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-medium text-foreground">Announcement status</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.announcementEnabled && settings.announcementText
                        ? settings.announcementText
                        : "No live storefront announcement is currently active."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-medium text-foreground">Guest checkout</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.guestCheckoutEnabled
                        ? "Guests can place orders without a full account."
                        : "Customers need an account before they can order."}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="font-medium text-foreground">Delivery promise</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {settings.estimatedDeliveryWindow || "No delivery promise saved yet."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Channel controls</CardTitle>
                  <CardDescription>Toggle what the customer website and app can do in production.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Customer website</p>
                          <p className="text-sm text-muted-foreground">Allow customers to browse and place orders on the web.</p>
                        </div>
                        <Switch
                          checked={settings.websiteEnabled}
                          onCheckedChange={(checked) => setSettings((current) => ({ ...current, websiteEnabled: checked }))}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Customer mobile app</p>
                          <p className="text-sm text-muted-foreground">Allow orders and account access from iOS and Android.</p>
                        </div>
                        <Switch
                          checked={settings.mobileAppEnabled}
                          onCheckedChange={(checked) => setSettings((current) => ({ ...current, mobileAppEnabled: checked }))}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Maintenance mode</p>
                          <p className="text-sm text-muted-foreground">Temporarily pause ordering while keeping admin live.</p>
                        </div>
                        <Switch
                          checked={settings.maintenanceMode}
                          onCheckedChange={(checked) => setSettings((current) => ({ ...current, maintenanceMode: checked }))}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Auto approve customer orders</p>
                          <p className="text-sm text-muted-foreground">Useful when website and app orders should flow straight to fulfilment.</p>
                        </div>
                        <Switch
                          checked={settings.autoApproveOrders}
                          onCheckedChange={(checked) => setSettings((current) => ({ ...current, autoApproveOrders: checked }))}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Inventory sync to storefront</p>
                          <p className="text-sm text-muted-foreground">Use OS inventory as the live source of truth for website and app.</p>
                        </div>
                        <Switch
                          checked={settings.inventorySyncEnabled}
                          onCheckedChange={(checked) => setSettings((current) => ({ ...current, inventorySyncEnabled: checked }))}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Show out-of-stock items</p>
                          <p className="text-sm text-muted-foreground">Control whether unavailable items still appear as discoverable merch.</p>
                        </div>
                        <Switch
                          checked={settings.showOutOfStock}
                          onCheckedChange={(checked) => setSettings((current) => ({ ...current, showOutOfStock: checked }))}
                        />
                      </div>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 md:col-span-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-foreground">Guest checkout</p>
                          <p className="text-sm text-muted-foreground">Allow guest ordering, or keep checkout account-only for tighter B2B control.</p>
                        </div>
                        <Switch
                          checked={settings.guestCheckoutEnabled}
                          onCheckedChange={(checked) => setSettings((current) => ({ ...current, guestCheckoutEnabled: checked }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="websiteUrl">Website URL</Label>
                      <Input
                        id="websiteUrl"
                        value={settings.websiteUrl || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, websiteUrl: event.target.value }))}
                        placeholder="https://shop.yourbrand.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supportEmail">Support email</Label>
                      <Input
                        id="supportEmail"
                        value={settings.supportEmail || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, supportEmail: event.target.value }))}
                        placeholder="support@yourbrand.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="playStoreUrl">Play Store URL</Label>
                      <Input
                        id="playStoreUrl"
                        value={settings.playStoreUrl || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, playStoreUrl: event.target.value }))}
                        placeholder="https://play.google.com/store/apps/details?id=..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="appStoreUrl">App Store URL</Label>
                      <Input
                        id="appStoreUrl"
                        value={settings.appStoreUrl || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, appStoreUrl: event.target.value }))}
                        placeholder="https://apps.apple.com/app/..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="supportPhone">Support phone</Label>
                      <Input
                        id="supportPhone"
                        value={settings.supportPhone || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, supportPhone: event.target.value }))}
                        placeholder="+61 400 000 000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="primaryCtaHref">Primary CTA link</Label>
                      <Input
                        id="primaryCtaHref"
                        value={settings.primaryCtaHref || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, primaryCtaHref: event.target.value }))}
                        placeholder="/products"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="featuredCategoryIds">Featured category ids</Label>
                      <Input
                        id="featuredCategoryIds"
                        value={settings.featuredCategoryIds || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, featuredCategoryIds: event.target.value }))}
                        placeholder="cat_beverages,cat_snacks,cat_grocery"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="minimumOrderAmount">Minimum order amount</Label>
                      <Input
                        id="minimumOrderAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={settings.minimumOrderAmount}
                        onChange={(event) => setSettings((current) => ({ ...current, minimumOrderAmount: Number(event.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="freeDeliveryThreshold">Free delivery threshold</Label>
                      <Input
                        id="freeDeliveryThreshold"
                        type="number"
                        min="0"
                        step="0.01"
                        value={settings.freeDeliveryThreshold}
                        onChange={(event) => setSettings((current) => ({ ...current, freeDeliveryThreshold: Number(event.target.value) || 0 }))}
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="supportHours">Support hours</Label>
                      <Input
                        id="supportHours"
                        value={settings.supportHours || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, supportHours: event.target.value }))}
                        placeholder="Mon-Fri, 8am-6pm"
                      />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="estimatedDeliveryWindow">Delivery promise</Label>
                      <Input
                        id="estimatedDeliveryWindow"
                        value={settings.estimatedDeliveryWindow || ""}
                        onChange={(event) => setSettings((current) => ({ ...current, estimatedDeliveryWindow: event.target.value }))}
                        placeholder="Same-day metro delivery for approved accounts."
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Customer-facing content</CardTitle>
                  <CardDescription>Centralize the hero copy, CTA, and announcement messaging for the storefront.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="heroTitle">Hero title</Label>
                    <Input
                      id="heroTitle"
                      value={settings.heroTitle || ""}
                      onChange={(event) => setSettings((current) => ({ ...current, heroTitle: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="heroSubtitle">Hero subtitle</Label>
                    <Textarea
                      id="heroSubtitle"
                      value={settings.heroSubtitle || ""}
                      onChange={(event) => setSettings((current) => ({ ...current, heroSubtitle: event.target.value }))}
                      rows={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="primaryCtaLabel">Primary CTA label</Label>
                    <Input
                      id="primaryCtaLabel"
                      value={settings.primaryCtaLabel || ""}
                      onChange={(event) => setSettings((current) => ({ ...current, primaryCtaLabel: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seoTitle">SEO title</Label>
                    <Input
                      id="seoTitle"
                      value={settings.seoTitle || ""}
                      onChange={(event) => setSettings((current) => ({ ...current, seoTitle: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seoDescription">SEO description</Label>
                    <Textarea
                      id="seoDescription"
                      value={settings.seoDescription || ""}
                      onChange={(event) => setSettings((current) => ({ ...current, seoDescription: event.target.value }))}
                      rows={3}
                    />
                  </div>

                  <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">Announcement bar</p>
                        <p className="text-sm text-muted-foreground">Push a temporary promo, delay notice, or service update to the storefront.</p>
                      </div>
                      <Switch
                        checked={settings.announcementEnabled}
                        onCheckedChange={(checked) => setSettings((current) => ({ ...current, announcementEnabled: checked }))}
                      />
                    </div>
                    <Textarea
                      value={settings.announcementText || ""}
                      onChange={(event) => setSettings((current) => ({ ...current, announcementText: event.target.value }))}
                      rows={3}
                      placeholder="Free delivery on orders above $100 today."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="returnsPolicySummary">Returns policy summary</Label>
                    <Textarea
                      id="returnsPolicySummary"
                      value={settings.returnsPolicySummary || ""}
                      onChange={(event) => setSettings((current) => ({ ...current, returnsPolicySummary: event.target.value }))}
                      rows={3}
                      placeholder="Contact support within 24 hours for damaged or incorrect items."
                    />
                  </div>

                  <div className="rounded-xl border border-dashed border-border p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <ExternalLink className="h-4 w-4 text-primary" />
                      Deployment handoff
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Save the production website URL, App Store links, support contacts, and storefront message here so your ops team always has one live source of truth.
                    </p>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/30 p-4">
                    <p className="text-sm font-medium text-foreground">Content preview</p>
                    <p className="mt-3 text-xl font-semibold text-foreground">{settings.heroTitle || "No hero title yet"}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {settings.heroSubtitle || "No hero subtitle yet"}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge variant="secondary">{settings.primaryCtaLabel || "No CTA label"}</Badge>
                      <Badge variant="outline">Min order {formatCurrencyShort(settings.minimumOrderAmount || 0)}</Badge>
                      {settings.announcementEnabled && settings.announcementText ? (
                        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20">Announcement live</Badge>
                      ) : (
                        <Badge variant="outline">Announcement off</Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
