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
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
        <div className="space-y-2">
          <Link
            href="/crm"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3 w-3" />
            Back to CRM
          </Link>
          <PageHeader
            title={customer.name}
            description={
              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                <Badge className={HEALTH_TONE[health.band] || ""}>
                  {health.band} · {health.score}
                </Badge>
                <span>{customer.customerType}</span>
                {customer.industry ? <span>· {customer.industry}</span> : null}
                <span>· net {customer.paymentTerms}</span>
                {customer.salesRep ? <span>· rep {customer.salesRep.name}</span> : <span>· no rep</span>}
              </div>
            }
            actions={
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            }
          />
        </div>

        {health.reasons.length ? (
          <Card className="border-l-4 border-l-amber-500 bg-amber-500/5">
            <CardContent className="space-y-1 p-4">
              <p className="text-sm font-medium text-foreground">Why this account scores {health.score}</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {health.reasons.map((reason) => (
                  <li key={reason}>· {reason}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Lifetime Spend"
            value={money(stats.totalSpend)}
            description={`${stats.orderCount} orders`}
            icon={CircleDollarSign}
          />
          <KpiCard
            title="Average Order"
            value={money(stats.averageOrderValue)}
            description={`net ${customer.paymentTerms}`}
          />
          <KpiCard
            title="Overdue"
            value={money(stats.overdueValue)}
            description={`${stats.openInvoices} open invoices`}
          />
          <KpiCard
            title="Credit Used"
            value={customer.creditUsagePercent === null ? "No limit" : `${customer.creditUsagePercent}%`}
            description={`${money(customer.availableCredit)} available`}
          />
          <KpiCard
            title="Ordering Rhythm"
            value={cadence ? `${cadence.typicalGapDays}d` : "—"}
            description={cadence
              ? `${cadence.daysSinceLastOrder}d since last${cadence.overdueBy > 0 ? " · overdue" : ""}`
              : "needs 3+ orders"}
          />
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
