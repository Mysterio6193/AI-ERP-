"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Clock, FileSearch, FileText, Loader2, Search, XCircle, DollarSign, AlertCircle } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { PageHeader } from "@/components/ui/page-header"
import { KpiCard } from "@/components/ui/kpi-card"
import { EmptyState } from "@/components/ui/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { formatCurrency, formatCurrencyShort } from "@/lib/types"

type CreditApplication = {
  id: string
  businessName: string
  tradingName?: string | null
  requestedLimit: number
  averageMonthlySpend: number
  status: string
  contactEmail?: string | null
  contactPhone?: string | null
  accountsContact?: string | null
  accountsEmail?: string | null
  reviewNotes?: string | null
  approvedLimit?: number | null
  approvedTerms?: number | null
  payloadJson: string
  createdAt: string
  customer: {
    id: string
    name: string
    email?: string | null
    phone?: string | null
    creditLimit: number
    creditStatus: string
    status: string
  }
}

const statusTone: Record<string, string> = {
  submitted: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  under_review: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  rejected: "bg-rose-500/10 text-destructive border-rose-500/20",
}

export default function CreditApplicationsPage() {
  const [applications, setApplications] = useState<CreditApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selected, setSelected] = useState<CreditApplication | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const [reviewStatus, setReviewStatus] = useState("approved")
  const [approvedLimit, setApprovedLimit] = useState("")
  const [approvedTerms, setApprovedTerms] = useState("30")
  const [reviewNotes, setReviewNotes] = useState("")

  const loadApplications = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/credit-applications")
      const data = await res.json()
      if (data.success) {
        setApplications(data.data || [])
      }
    } catch (error) {
      console.error("Failed to load credit applications:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadApplications()
  }, [])

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch =
        !search ||
        app.businessName.toLowerCase().includes(search.toLowerCase()) ||
        app.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        (app.contactEmail || "").toLowerCase().includes(search.toLowerCase())

      const matchesStatus = statusFilter === "all" || app.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [applications, search, statusFilter])

  const openReview = (application: CreditApplication) => {
    setSelected(application)
    setReviewStatus(application.status === "submitted" ? "under_review" : application.status)
    setApprovedLimit(String(application.approvedLimit ?? application.requestedLimit ?? 0))
    setApprovedTerms(String(application.approvedTerms ?? 30))
    setReviewNotes(application.reviewNotes || "")
    setReviewOpen(true)
  }

  const handleSaveReview = async () => {
    if (!selected) return

    try {
      setSaving(true)
      const res = await fetch(`/api/credit-applications/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: reviewStatus,
          approvedLimit: reviewStatus === "approved" ? Number(approvedLimit) : null,
          approvedTerms: reviewStatus === "approved" ? Number(approvedTerms) : null,
          reviewNotes,
        }),
      })
      const data = await res.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to update application review")
      }

      setReviewOpen(false)
      setSelected(null)
      void loadApplications()
    } catch (error) {
      console.error("Error saving credit application review:", error)
    } finally {
      setSaving(false)
    }
  }

  const parsedPayload = useMemo(() => {
    if (!selected?.payloadJson) return null
    try {
      return JSON.parse(selected.payloadJson)
    } catch {
      return null
    }
  }, [selected])

  return (
    <AppShell title="Credit Applications" breadcrumbs={[{ label: "Customers", href: "/customers" }, { label: "Credit Applications" }]}>
      <div className="space-y-6">
        <PageHeader
          title="Credit Applications"
          description="Review, approve, and track digital credit applications submitted by trade customers."
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total Applications"
            value={applications.length}
            icon={FileText}
          />
          <KpiCard
            title="Pending Review"
            value={applications.filter((application) => ["submitted", "under_review"].includes(application.status)).length}
            icon={Clock}
          />
          <KpiCard
            title="Approved"
            value={applications.filter((application) => application.status === "approved").length}
            icon={CheckCircle2}
          />
          <KpiCard
            title="Requested Exposure"
            value={formatCurrencyShort(applications.reduce((sum, application) => sum + application.requestedLimit, 0))}
            icon={DollarSign}
          />
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search business name, customer, or email..."
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm overflow-hidden">
          <CardHeader className="p-4 sm:p-6 pb-2">
            <CardTitle className="text-base">Applications</CardTitle>
            <CardDescription>Each record is submitted live from the customer website credit form.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Requested Limit</TableHead>
                  <TableHead>Monthly Spend</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading credit applications...
                    </TableCell>
                  </TableRow>
                ) : filteredApplications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0">
                      <EmptyState
                        icon={FileSearch}
                        title="No credit applications found"
                        description={search || statusFilter !== "all" ? "No applications match your filter criteria." : "No credit applications submitted yet."}
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredApplications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{application.businessName}</p>
                          <p className="text-xs text-muted-foreground">{application.contactEmail || application.contactPhone || "No contact saved"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{application.customer.name}</p>
                          <p className="text-xs text-muted-foreground">{application.customer.email || application.customer.phone || "No contact saved"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{formatCurrency(application.requestedLimit)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatCurrency(application.averageMonthlySpend)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusTone[application.status] || "border-border text-foreground"}>
                          {application.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{new Date(application.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" onClick={() => openReview(application)}>
                          <FileSearch className="mr-2 h-4 w-4" />
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            {selected && (
              <>
                <DialogHeader>
                  <DialogTitle>{selected.businessName}</DialogTitle>
                  <DialogDescription>
                    Submitted by {selected.customer.name}. Reviewing this application can update the live customer credit limit and terms.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 lg:grid-cols-[1.3fr,0.9fr]">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Submitted data</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Requested limit</Label>
                          <p className="font-medium">{formatCurrency(selected.requestedLimit)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Average monthly spend</Label>
                          <p className="font-medium">{formatCurrency(selected.averageMonthlySpend)}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Accounts contact</Label>
                          <p className="font-medium">{selected.accountsContact || "Not provided"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Accounts email</Label>
                          <p className="font-medium">{selected.accountsEmail || "Not provided"}</p>
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-4">
                        <Label className="text-xs text-muted-foreground">Original submission payload</Label>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-700">
                          {JSON.stringify(JSON.parse(selected.payloadJson || "{}"), null, 2)}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base">Decision</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={reviewStatus}
                          onValueChange={(value) => setReviewStatus(value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="under_review">Under review</SelectItem>
                            <SelectItem value="approved">Approve</SelectItem>
                            <SelectItem value="rejected">Reject</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Approved credit limit</Label>
                        <Input
                          type="number"
                          value={approvedLimit}
                          onChange={(event) =>
                            setApprovedLimit(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Approved payment terms</Label>
                        <Input
                          type="number"
                          value={approvedTerms}
                          onChange={(event) =>
                            setApprovedTerms(event.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Review notes</Label>
                        <Textarea
                          rows={5}
                          value={reviewNotes}
                          onChange={(event) =>
                            setReviewNotes(event.target.value)
                          }
                          placeholder="Summarize the decision, required follow-up, or why the application was rejected."
                        />
                      </div>
                      <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                        Current live account: {formatCurrency(selected.customer.creditLimit)} credit limit,{" "}
                        {selected.customer.creditStatus.replace(/_/g, " ")} credit status.
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setReviewOpen(false)}>
                    Close
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setReviewStatus("rejected")
                    }
                  >
                    <XCircle className="mr-2 h-4 w-4 text-destructive" />
                    Mark Rejected
                  </Button>
                  <Button onClick={handleSaveReview} disabled={saving}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    Save Decision
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
