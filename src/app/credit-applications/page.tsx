"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, FileSearch, Loader2, Search, XCircle } from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
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
import { formatCurrency } from "@/lib/types"

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
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
}

export default function CreditApplicationsPage() {
  const [applications, setApplications] = useState<CreditApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selected, setSelected] = useState<CreditApplication | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewForm, setReviewForm] = useState({
    status: "under_review",
    approvedLimit: "",
    approvedTerms: "30",
    reviewNotes: "",
  })

  async function fetchApplications() {
    setLoading(true)
    try {
      const response = await fetch("/api/credit-applications")
      const payload = await response.json()
      if (payload.success) {
        setApplications(payload.data || [])
      }
    } catch (error) {
      console.error("Error fetching credit applications:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchApplications()
  }, [])

  const filteredApplications = useMemo(() => {
    return applications.filter((application) => {
      const matchesSearch =
        application.businessName.toLowerCase().includes(search.toLowerCase()) ||
        application.customer.name.toLowerCase().includes(search.toLowerCase()) ||
        (application.contactEmail || "").toLowerCase().includes(search.toLowerCase())
      const matchesStatus = statusFilter === "all" || application.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [applications, search, statusFilter])

  function openReview(application: CreditApplication) {
    setSelected(application)
    setReviewForm({
      status: application.status === "submitted" ? "under_review" : application.status,
      approvedLimit: String(application.approvedLimit ?? application.requestedLimit ?? ""),
      approvedTerms: String(application.approvedTerms ?? 30),
      reviewNotes: application.reviewNotes || "",
    })
    setReviewOpen(true)
  }

  async function submitReview() {
    if (!selected) return
    try {
      setSubmitting(true)
      const response = await fetch(`/api/credit-applications/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: reviewForm.status,
          approvedLimit: Number(reviewForm.approvedLimit) || 0,
          approvedTerms: Number(reviewForm.approvedTerms) || 30,
          reviewNotes: reviewForm.reviewNotes,
          reviewedBy: "admin",
        }),
      })
      const payload = await response.json()
      if (!payload.success) {
        throw new Error(payload.error || "Failed to update application")
      }
      setReviewOpen(false)
      await fetchApplications()
    } catch (error) {
      console.error("Error reviewing credit application:", error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell title="Credit Applications" breadcrumbs={[{ label: "Credit Applications" }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Credit Applications</h1>
          <p className="text-muted-foreground">
            Review credit requests submitted from the customer website and convert them into live account terms.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total applications</CardDescription>
              <CardTitle className="text-2xl">{applications.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Pending review</CardDescription>
              <CardTitle className="text-2xl">
                {applications.filter((application) => ["submitted", "under_review"].includes(application.status)).length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Approved</CardDescription>
              <CardTitle className="text-2xl">
                {applications.filter((application) => application.status === "approved").length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Requested exposure</CardDescription>
              <CardTitle className="text-2xl">
                {formatCurrency(applications.reduce((sum, application) => sum + application.requestedLimit, 0))}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4 md:flex-row">
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
                <SelectTrigger className="w-full md:w-56">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="under_review">Under review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Applications</CardTitle>
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
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      Loading credit applications...
                    </TableCell>
                  </TableRow>
                ) : filteredApplications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                      No credit applications found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredApplications.map((application) => (
                    <TableRow key={application.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-900">{application.businessName}</p>
                          <p className="text-xs text-muted-foreground">{application.contactEmail || application.contactPhone || "No contact saved"}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{application.customer.name}</p>
                          <p className="text-xs text-muted-foreground">{application.customer.email || application.customer.phone || "No contact saved"}</p>
                        </div>
                      </TableCell>
                      <TableCell>{formatCurrency(application.requestedLimit)}</TableCell>
                      <TableCell>{formatCurrency(application.averageMonthlySpend)}</TableCell>
                      <TableCell>
                        <Badge className={statusTone[application.status] || "bg-slate-100 text-slate-700"}>
                          {application.status.replace(/_/g, " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(application.createdAt).toLocaleDateString()}</TableCell>
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

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Decision</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                          value={reviewForm.status}
                          onValueChange={(value) => setReviewForm((current) => ({ ...current, status: value }))}
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
                          value={reviewForm.approvedLimit}
                          onChange={(event) =>
                            setReviewForm((current) => ({ ...current, approvedLimit: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Approved payment terms</Label>
                        <Input
                          type="number"
                          value={reviewForm.approvedTerms}
                          onChange={(event) =>
                            setReviewForm((current) => ({ ...current, approvedTerms: event.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Review notes</Label>
                        <Textarea
                          rows={5}
                          value={reviewForm.reviewNotes}
                          onChange={(event) =>
                            setReviewForm((current) => ({ ...current, reviewNotes: event.target.value }))
                          }
                          placeholder="Summarize the decision, required follow-up, or why the application was rejected."
                        />
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
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
                      setReviewForm((current) => ({ ...current, status: "rejected" }))
                    }
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Mark Rejected
                  </Button>
                  <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={submitReview} disabled={submitting}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
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
