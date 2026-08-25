"use client"

import { use, useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  Check,
  CircleDollarSign,
  Loader2,
  Mail,
  Package,
  Phone,
  Plus,
  RefreshCw,
  Star,
  User,
} from "lucide-react"

import { AgentChat } from "@/components/agent/agent-chat"
import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface Account {
  customer: {
    id: string
    name: string
    tradingName: string | null
    contactPerson: string | null
    email: string | null
    phone: string | null
    industry: string | null
    customerType: string
    status: string
    creditLimit: number
    creditBalance: number
    creditStatus: string
    paymentTerms: number
    availableCredit: number
    creditUsagePercent: number | null
    salesRep: { name: string } | null
    locations: Array<{ id: string; address: string; city: string; state: string; postcode: string }>
  }
  health: { score: number; band: string; reasons: string[] }
  cadence: { typicalGapDays: number; daysSinceLastOrder: number; overdueBy: number } | null
  stats: {
    orderCount: number
    totalSpend: number
    averageOrderValue: number
    overdueValue: number
    openInvoices: number
    openCases: number
    customerSinceDays: number
  }
  topProducts: Array<{ product: string; quantity: number; value: number }>
  contacts: Array<{
    id: string
    name: string
    role: string
    jobTitle: string | null
    email: string | null
    phone: string | null
    mobile: string | null
    isPrimary: boolean
    isDecisionMaker: boolean
    preferredChannel: string | null
  }>
  orders: Array<{
    id: string
    orderNumber: string
    status: string
    total: number
    orderDate: string
    channel: string | null
  }>
  invoices: Array<{
    id: string
    invoiceNumber: string
    status: string
    totalAmount: number
    outstandingAmt: number
    daysOverdue: number
  }>
  cases: Array<{
    id: string
    caseNumber: string
    subject: string
    category: string
    severity: string
    status: string
  }>
  opportunities: Array<{
    id: string
    name: string
    stage: string
    value: number
    probability: number
  }>
  tasks: Array<{ id: string; title: string; type: string; dueAt: string | null; priority: string }>
  activities: Array<{
    id: string
    type: string
    subject: string
    body: string | null
    occurredAt: string
    createdByAgent: boolean
    contact: { name: string } | null
    user: { name: string } | null
  }>
  channelRole: string
  suppliedBy: { id: string; name: string } | null
  usage: Array<{
    id: string
    product: string
    productId: string | null
    sku: string | null
    status: string
    statusLabel: string
    quantity: number | null
    period: string
    unit: string | null
    via: string | null
    switchedTo: string | null
    notes: string | null
    confidence: "confirmed" | "ageing" | "stale" | "unconfirmed"
    confidenceLabel: string
  }>
}

/**
 * How sure we are of a usage figure, shown as colour.
 *
 * Amber and rose are not decoration here: an unchecked figure quoted to a
 * customer as current is the failure this whole card exists to prevent.
 */
const CONFIDENCE_TONE: Record<string, string> = {
  confirmed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  ageing: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  stale: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  unconfirmed: "bg-muted text-muted-foreground",
}

const USAGE_TONE: Record<string, string> = {
  using: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  trialling: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  lapsed: "bg-muted text-muted-foreground",
  lost_to_competitor: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
}

function money(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const HEALTH_TONE: Record<string, string> = {
  healthy: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  watch: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  "at risk": "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
}

export default function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { toast } = useToast()
  const { id } = use(params)

  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState("overview")

  const [activitySubject, setActivitySubject] = useState("")
  const [activityBody, setActivityBody] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactRole, setContactRole] = useState("buyer")
  const [contactPhone, setContactPhone] = useState("")
  const [caseSubject, setCaseSubject] = useState("")
  const [taskTitle, setTaskTitle] = useState("")

  // Recording what a venue uses needs a product and, usually, the distributor
  // it comes through — neither is on the account payload.
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string | null }>>([])
  const [distributors, setDistributors] = useState<Array<{ id: string; name: string }>>([])
  const [usageProduct, setUsageProduct] = useState("")
  const [usageQty, setUsageQty] = useState("")
  const [usagePeriod, setUsagePeriod] = useState("week")
  const [usageUnit, setUsageUnit] = useState("")
  const [usageVia, setUsageVia] = useState("")
  const [usageStatus, setUsageStatus] = useState("using")

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const response = await fetch(`/api/crm/account/${id}`)
      const payload = await response.json()

      if (payload.success) {
        setAccount(payload.data)
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void (async () => {
      const [productRes, accountRes] = await Promise.all([
        fetch("/api/products?pageSize=500").then((r) => r.json()).catch(() => null),
        fetch("/api/crm?view=accounts&pageSize=200").then((r) => r.json()).catch(() => null),
      ])

      if (productRes?.success) {
        const list = Array.isArray(productRes.data) ? productRes.data : productRes.data?.products ?? []
        setProducts(list.map((p: { id: string; name: string; sku?: string | null }) => ({ id: p.id, name: p.name, sku: p.sku ?? null })))
      }

      if (accountRes?.success) setDistributors(accountRes.data.distributors ?? [])
    })()
  }, [])

  const act = useCallback(
    async (action: string, payload: Record<string, unknown>) => {
      setBusy(true)

      try {
        const response = await fetch("/api/crm/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, customerId: id, ...payload }),
        })

        const result = await response.json()

        if (!result.success) {
          toast({
            variant: "destructive",
            title: "Action failed",
            description: result.error || "Request failed",
          })
          return false
        }

        await load()
        toast({
          title: "Success",
          description: "Account updated successfully.",
        })
        return true
      } finally {
        setBusy(false)
      }
    },
    [id, load]
  )

  if (loading && !account) {
    return (
      <AppShell title="Account">
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading account…
        </div>
      </AppShell>
    )
  }

  if (!account) {
    return (
      <AppShell title="Account">
        <p className="py-16 text-sm text-muted-foreground">That account could not be found.</p>
      </AppShell>
    )
  }

  const { customer, health, cadence, stats } = account

  return (
    <AppShell title={customer.name}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <Link
              href="/crm"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:underline"
            >
              <ArrowLeft className="h-3 w-3" />
              CRM
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">{customer.name}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge className={HEALTH_TONE[health.band] || ""}>
                {health.band} · {health.score}
              </Badge>
              <span>{customer.customerType}</span>
              {customer.industry ? <span>· {customer.industry}</span> : null}
              <span>· net {customer.paymentTerms}</span>
              {customer.salesRep ? <span>· rep {customer.salesRep.name}</span> : <span>· no rep</span>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-3.5 w-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {health.reasons.length ? (
          <Card className="border-l-4 border-l-amber-400">
            <CardContent className="space-y-1 p-4">
              <p className="text-sm font-medium">Why this account scores {health.score}</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {health.reasons.map((reason) => (
                  <li key={reason}>· {reason}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Lifetime spend", value: money(stats.totalSpend), hint: `${stats.orderCount} orders` },
            { label: "Average order", value: money(stats.averageOrderValue), hint: `net ${customer.paymentTerms}` },
            {
              label: "Overdue",
              value: money(stats.overdueValue),
              hint: `${stats.openInvoices} open invoices`,
            },
            {
              label: "Credit used",
              value: customer.creditUsagePercent === null ? "No limit" : `${customer.creditUsagePercent}%`,
              hint: `${money(customer.availableCredit)} available`,
            },
            {
              label: "Ordering rhythm",
              value: cadence ? `${cadence.typicalGapDays}d` : "—",
              hint: cadence
                ? `${cadence.daysSinceLastOrder}d since last${cadence.overdueBy > 0 ? " · overdue" : ""}`
                : "needs 3+ orders",
            },
          ].map((card) => (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <CardDescription>{card.label}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold">{card.value}</p>
                <p className="text-xs text-muted-foreground">{card.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="trade">Orders</TabsTrigger>
              <TabsTrigger value="service">Service</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Package className="h-3.5 w-3.5" />
                    What they buy
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {!account.topProducts.length ? (
                    <p className="text-xs text-muted-foreground">No order history yet.</p>
                  ) : (
                    account.topProducts.map((product) => (
                      <div key={product.product} className="flex justify-between text-xs">
                        <span>
                          {product.product}
                          <span className="text-muted-foreground"> × {product.quantity}</span>
                        </span>
                        <span className="font-medium">{money(product.value)}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Open work</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {account.tasks.map((task) => (
                    <div key={task.id} className="flex items-center justify-between gap-2 text-xs">
                      <span>
                        {task.title}
                        {task.dueAt ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · due {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        ) : null}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        disabled={busy}
                        onClick={() => void act("completeTask", { taskId: task.id })}
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Done
                      </Button>
                    </div>
                  ))}
                  {account.opportunities.map((opportunity) => (
                    <div key={opportunity.id} className="flex items-center justify-between text-xs">
                      <span>
                        {opportunity.name}
                        <span className="text-muted-foreground"> · {opportunity.stage}</span>
                      </span>
                      <span className="font-medium">{money(opportunity.value)}</span>
                    </div>
                  ))}
                  {!account.tasks.length && !account.opportunities.length ? (
                    <p className="text-xs text-muted-foreground">Nothing open.</p>
                  ) : null}

                  <div className="flex gap-2 pt-2">
                    <Input
                      value={taskTitle}
                      onChange={(event) => setTaskTitle(event.target.value)}
                      placeholder="Add a follow-up…"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      disabled={busy || !taskTitle.trim()}
                      onClick={async () => {
                        if (await act("createTask", { title: taskTitle })) {
                          setTaskTitle("")
                        }
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="people" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Contacts</CardTitle>
                  <CardDescription>
                    A trade account is several people. Knowing who decides matters.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!account.contacts.length ? (
                    <p className="text-xs text-muted-foreground">No contacts recorded yet.</p>
                  ) : (
                    account.contacts.map((contact) => (
                      <div key={contact.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{contact.name}</span>
                          {contact.isPrimary ? (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <Star className="h-2.5 w-2.5" />
                              primary
                            </Badge>
                          ) : null}
                          {contact.isDecisionMaker ? (
                            <Badge variant="outline" className="text-[10px]">
                              decision maker
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {contact.jobTitle || contact.role}
                          {contact.preferredChannel ? ` · prefers ${contact.preferredChannel}` : ""}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {contact.phone ? (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {contact.phone}
                            </span>
                          ) : null}
                          {contact.email ? (
                            <span className="flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {contact.email}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}

                  <div className="grid gap-2 border-t pt-3 sm:grid-cols-[1fr_140px_1fr_auto]">
                    <Input
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                      placeholder="Name"
                      className="h-8 text-xs"
                    />
                    <select
                      value={contactRole}
                      onChange={(event) => setContactRole(event.target.value)}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      <option value="buyer">Buyer</option>
                      <option value="manager">Manager</option>
                      <option value="chef">Chef</option>
                      <option value="accounts_payable">Accounts</option>
                      <option value="owner">Owner</option>
                    </select>
                    <Input
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                      placeholder="Phone"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      disabled={busy || !contactName.trim()}
                      onClick={async () => {
                        const added = await act("upsertContact", {
                          name: contactName,
                          role: contactRole,
                          phone: contactPhone,
                          isPrimary: account.contacts.length === 0,
                        })
                        if (added) {
                          setContactName("")
                          setContactPhone("")
                        }
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="timeline" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Log what happened</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Input
                    value={activitySubject}
                    onChange={(event) => setActivitySubject(event.target.value)}
                    placeholder="Called about the Tuesday delivery window"
                    className="h-8 text-xs"
                  />
                  <Textarea
                    value={activityBody}
                    onChange={(event) => setActivityBody(event.target.value)}
                    placeholder="What was said or agreed…"
                    className="min-h-[60px] text-xs"
                  />
                  <div className="flex gap-2">
                    {["call", "visit", "note", "email"].map((type) => (
                      <Button
                        key={type}
                        size="sm"
                        variant="outline"
                        className="text-[11px] capitalize"
                        disabled={busy || !activitySubject.trim()}
                        onClick={async () => {
                          const logged = await act("logActivity", {
                            type,
                            subject: activitySubject,
                            body: activityBody,
                          })
                          if (logged) {
                            setActivitySubject("")
                            setActivityBody("")
                          }
                        }}
                      >
                        Log {type}
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">History</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!account.activities.length ? (
                    <p className="text-xs text-muted-foreground">Nothing logged yet.</p>
                  ) : (
                    account.activities.map((activity) => (
                      <div key={activity.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {activity.type}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(activity.occurredAt).toLocaleString()}
                          </span>
                          {activity.createdByAgent ? (
                            <Badge variant="outline" className="gap-1 text-[10px]">
                              <Bot className="h-2.5 w-2.5" />
                              agent
                            </Badge>
                          ) : null}
                        </div>
                        <p className="mt-1 text-sm">{activity.subject}</p>
                        {activity.body ? (
                          <p className="text-xs text-muted-foreground">{activity.body}</p>
                        ) : null}
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {activity.contact?.name ? `${activity.contact.name} · ` : ""}
                          {activity.user?.name ? `logged by ${activity.user.name}` : ""}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="trade" className="mt-4 space-y-4">
              {/*
                For a venue that buys through a distributor this card is the
                whole trade record — the order book has nothing, because the
                order was never placed with us.
              */}
              {account.channelRole === "end_user" ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Package className="h-3.5 w-3.5" />
                      What they use
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {account.suppliedBy
                        ? `Bought through ${account.suppliedBy.name}, so none of it appears in our orders.`
                        : "No distributor recorded yet — set one on the Accounts page."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!account.usage.length ? (
                      <p className="text-xs text-muted-foreground">
                        Nothing recorded. Add what they cook with after the next visit — it is the only
                        way this venue&apos;s demand shows up anywhere.
                      </p>
                    ) : (
                      account.usage.map((row) => (
                        <div key={row.id} className="rounded-lg border p-2.5 text-xs">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{row.product}</span>
                            <Badge className={USAGE_TONE[row.status] ?? "bg-muted"} variant="secondary">
                              {row.statusLabel}
                            </Badge>
                            <Badge className={CONFIDENCE_TONE[row.confidence]} variant="secondary">
                              {row.confidenceLabel}
                            </Badge>
                          </div>

                          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                            <span>
                              {row.quantity !== null
                                ? `About ${row.quantity} ${row.unit ?? ""} a ${row.period}`.replace(/\s+/g, " ")
                                : "No quantity recorded"}
                            </span>
                            {row.via ? <span>via {row.via}</span> : null}
                            {row.switchedTo ? <span>Switched to {row.switchedTo}</span> : null}
                          </div>

                          {row.notes ? <p className="mt-1.5 text-muted-foreground">{row.notes}</p> : null}

                          <div className="mt-2 flex gap-2">
                            {/* Confirming changes nothing but the age, which is the point. */}
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              disabled={busy}
                              onClick={() => void act("confirmEndUserUsage", { usageId: row.id })}
                            >
                              <Check className="mr-1 h-3 w-3" />
                              Still right
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11px] text-muted-foreground"
                              disabled={busy}
                              onClick={() => void act("removeEndUserUsage", { usageId: row.id })}
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))
                    )}

                    <div className="space-y-2 rounded-lg border border-dashed p-2.5">
                      <p className="text-xs font-medium">Record what they use</p>

                      <Select value={usageProduct} onValueChange={setUsageProduct}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Which product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map((product) => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      <div className="flex gap-2">
                        <Input
                          className="h-8 text-xs"
                          placeholder="How much"
                          value={usageQty}
                          onChange={(event) => setUsageQty(event.target.value)}
                        />
                        <Input
                          className="h-8 text-xs"
                          placeholder="Boxes"
                          value={usageUnit}
                          onChange={(event) => setUsageUnit(event.target.value)}
                        />
                        <Select value={usagePeriod} onValueChange={setUsagePeriod}>
                          <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="week">a week</SelectItem>
                            <SelectItem value="month">a month</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-2">
                        <Select value={usageVia} onValueChange={setUsageVia}>
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Through which distributor" />
                          </SelectTrigger>
                          <SelectContent>
                            {distributors.map((distributor) => (
                              <SelectItem key={distributor.id} value={distributor.id}>
                                {distributor.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={usageStatus} onValueChange={setUsageStatus}>
                          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="using">Using</SelectItem>
                            <SelectItem value="trialling">Trialling</SelectItem>
                            <SelectItem value="lapsed">Stopped using</SelectItem>
                            <SelectItem value="lost_to_competitor">Lost to a competitor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <Button
                        size="sm"
                        className="h-8 w-full text-xs"
                        disabled={busy || !usageProduct}
                        onClick={async () => {
                          const saved = await act("recordEndUserUsage", {
                            productId: usageProduct,
                            estimatedQty: usageQty,
                            period: usagePeriod,
                            unit: usageUnit,
                            viaDistributorId: usageVia || null,
                            status: usageStatus,
                          })

                          if (saved) {
                            setUsageProduct("")
                            setUsageQty("")
                            setUsageUnit("")
                          }
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Record
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Orders</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {!account.orders.length ? (
                    <p className="text-xs text-muted-foreground">No orders yet.</p>
                  ) : (
                    account.orders.map((order) => (
                      <div key={order.id} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{order.orderNumber}</span>
                        <span className="text-muted-foreground">
                          {new Date(order.orderDate).toLocaleDateString()} · {order.status}
                          {order.channel ? ` · ${order.channel}` : ""}
                        </span>
                        <span className="font-medium">{money(order.total)}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CircleDollarSign className="h-3.5 w-3.5" />
                    Invoices
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {!account.invoices.length ? (
                    <p className="text-xs text-muted-foreground">No invoices yet.</p>
                  ) : (
                    account.invoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{invoice.invoiceNumber}</span>
                        <span
                          className={
                            invoice.daysOverdue > 0 ? "text-rose-600" : "text-muted-foreground"
                          }
                        >
                          {invoice.status}
                          {invoice.daysOverdue > 0 ? ` · ${invoice.daysOverdue}d overdue` : ""}
                        </span>
                        <span className="font-medium">{money(invoice.outstandingAmt)}</span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="service" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Cases
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!account.cases.length ? (
                    <p className="text-xs text-muted-foreground">No cases raised.</p>
                  ) : (
                    account.cases.map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {record.caseNumber}
                            </span>
                            <Badge
                              variant={record.severity === "high" ? "destructive" : "secondary"}
                              className="text-[10px]"
                            >
                              {record.severity}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {record.status}
                            </Badge>
                          </div>
                          <p className="mt-0.5 text-sm">{record.subject}</p>
                        </div>
                        {["open", "in_progress"].includes(record.status) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void act("resolveCase", {
                                caseId: record.id,
                                resolution: "Resolved from account page",
                              })
                            }
                          >
                            Resolve
                          </Button>
                        ) : null}
                      </div>
                    ))
                  )}

                  <div className="flex gap-2 border-t pt-3">
                    <Input
                      value={caseSubject}
                      onChange={(event) => setCaseSubject(event.target.value)}
                      placeholder="Raise a case — what went wrong?"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      disabled={busy || !caseSubject.trim()}
                      onClick={async () => {
                        if (await act("createCase", { subject: caseSubject, severity: "normal" })) {
                          setCaseSubject("")
                        }
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="flex h-[620px] flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ask about {customer.name}</CardTitle>
              <CardDescription>The agent has this account&apos;s full history.</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              <AgentChat
                compact
                threadKey={`account:${id}`}
                suggestions={[
                  "Summarise this account for a call",
                  "What should I sell them next?",
                  "Draft a chase for their overdue invoice",
                ]}
                pageContext={`the user is viewing the account page for customer "${customer.name}" (customerId ${id})`}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}
