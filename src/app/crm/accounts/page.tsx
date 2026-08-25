"use client"

/**
 * Customers, told as a channel rather than as a flat list.
 *
 * RDM sells to distributors, and the venues that cook with the product buy it
 * from those distributors. Both belong here, and a single undifferentiated list
 * hides the difference that decides what to do with each: with a distributor
 * the job is reordering — are they buying, are they paying, are they buying
 * less — and with a venue it is demand creation, because they will never appear
 * in the order book no matter how much of the product they use.
 *
 * So the list says which each account is, and for a venue who supplies it. That
 * second column is the one a rep needs when a venue rings asking where to buy,
 * and an empty one is a venue nobody can answer.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Building2, Search, Store, Truck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"

interface Account {
  id: string
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  status: string
  channelRole: string | null
  creditStatus: string
  creditBalance: number
  suppliedBy: { id: string; name: string } | null
  salesRep: { name: string | null } | null
  _count: { orders: number; supplies: number }
}

const ROLES = [
  { value: "direct", label: "Buys direct", icon: Building2, hint: "Orders from us" },
  { value: "distributor", label: "Distributor", icon: Truck, hint: "Resells to venues" },
  { value: "end_user", label: "End user", icon: Store, hint: "Buys via a distributor" },
]

const ROLE_TONE: Record<string, string> = {
  direct: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  distributor: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  end_user: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
}

export default function AccountsPage() {
  const { toast } = useToast()

  const [accounts, setAccounts] = useState<Account[]>([])
  const [distributors, setDistributors] = useState<Array<{ id: string; name: string }>>([])
  const [roleCounts, setRoleCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState("")
  const [role, setRole] = useState("all")

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const params = new URLSearchParams({ view: "accounts", pageSize: "200" })
      if (search.trim()) params.set("search", search.trim())
      if (role !== "all") params.set("role", role)

      const result = await fetch(`/api/crm?${params}`).then((response) => response.json())

      if (result.success) {
        setAccounts(result.data.accounts)
        setDistributors(result.data.distributors || [])
        setRoleCounts(result.data.roleCounts || {})
        setTotal(result.data.total)
      }
    } finally {
      setLoading(false)
    }
  }, [search, role])

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, search])

  async function act(action: string, payload: Record<string, unknown>, done: string) {
    setBusy(true)

    try {
      const result = await fetch("/api/crm/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The route hands the whole body to its handler, so the fields go at
        // the top level rather than nested under a payload key.
        body: JSON.stringify({ action, ...payload }),
      }).then((response) => response.json())

      if (!result.ok && !result.success) {
        // The refusals here are meaningful — demoting a distributor that still
        // supplies venues, for one — so the reason is shown rather than a
        // generic failure.
        toast({ variant: "destructive", title: "Cannot do that", description: result.error || "Unknown error" })
        return
      }

      toast({ title: done })
      await load()
    } finally {
      setBusy(false)
    }
  }

  const unlinkedVenues = accounts.filter(
    (account) => account.channelRole === "end_user" && !account.suppliedBy
  ).length

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-muted-foreground">
          Everyone who buys the product, whether they buy it from us or from a distributor.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {ROLES.map((entry) => {
          const Icon = entry.icon
          const count = roleCounts[entry.value] ?? 0

          return (
            <Card
              key={entry.value}
              className={`cursor-pointer transition-colors ${role === entry.value ? "border-primary" : ""}`}
              onClick={() => setRole(role === entry.value ? "all" : entry.value)}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xl font-semibold">{count}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.label} · {entry.hint}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {unlinkedVenues > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
          {unlinkedVenues} venue{unlinkedVenues === 1 ? " has" : "s have"} no distributor recorded. If one of
          them rings asking where to buy, nobody can tell them.
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              {total} account{total === 1 ? "" : "s"}
            </CardTitle>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 w-60 pl-7 text-xs"
                  placeholder="Search name, contact, email…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every kind</SelectItem>
                  {ROLES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : accounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing matches those filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Account</th>
                    <th className="pb-2 font-medium">Kind</th>
                    <th className="pb-2 font-medium">Buys from</th>
                    <th className="pb-2 text-right font-medium">Orders</th>
                    <th className="pb-2 text-right font-medium">Owing</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const isVenue = account.channelRole === "end_user"

                    return (
                      <tr key={account.id} className="border-b last:border-0">
                        <td className="py-2.5">
                          <Link href={`/crm/accounts/${account.id}`} className="font-medium hover:underline">
                            {account.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {account.contactPerson || "No contact named"}
                            {account._count.supplies > 0 ? ` · supplies ${account._count.supplies} venue(s)` : ""}
                          </p>
                        </td>

                        <td className="py-2.5">
                          <Select
                            value={account.channelRole ?? "direct"}
                            onValueChange={(next) =>
                              act("setChannelRole", { customerId: account.id, role: next }, `${account.name} updated`)
                            }
                          >
                            <SelectTrigger className="h-7 w-36 text-xs">
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${ROLE_TONE[account.channelRole ?? "direct"] ?? ""}`}
                              >
                                {ROLES.find((r) => r.value === (account.channelRole ?? "direct"))?.label}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map((entry) => (
                                <SelectItem key={entry.value} value={entry.value} className="text-xs">
                                  {entry.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        <td className="py-2.5">
                          {isVenue ? (
                            <Select
                              value={account.suppliedBy?.id ?? "none"}
                              onValueChange={(next) =>
                                act(
                                  "setSupplyingDistributor",
                                  { customerId: account.id, distributorId: next === "none" ? null : next },
                                  `${account.name} updated`
                                )
                              }
                            >
                              <SelectTrigger
                                className={`h-7 w-44 text-xs ${account.suppliedBy ? "" : "border-amber-500/40"}`}
                              >
                                <SelectValue placeholder="Not recorded" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none" className="text-xs">Not recorded</SelectItem>
                                {distributors.map((entry) => (
                                  <SelectItem key={entry.id} value={entry.id} className="text-xs">
                                    {entry.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-xs text-muted-foreground">Us</span>
                          )}
                        </td>

                        <td className="py-2.5 text-right">
                          {isVenue ? (
                            // Zero orders is the expected state for a venue, so
                            // showing "0" would read as a problem it is not.
                            <span className="text-xs text-muted-foreground">via distributor</span>
                          ) : (
                            account._count.orders
                          )}
                        </td>

                        <td className="py-2.5 text-right">
                          {account.creditBalance > 0 ? (
                            <span className={account.creditStatus === "on_hold" ? "text-destructive" : ""}>
                              ${account.creditBalance.toFixed(2)}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
