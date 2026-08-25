"use client"

/**
 * Leads, as a page of their own.
 *
 * They were a tab on the CRM page, which is the wrong shape for how they
 * arrive. RDM meets most of its prospects at a trade show: fifty cards in two
 * days, entered in one sitting, then worked over the following fortnight. That
 * is a job with its own rhythm — capture fast, then filter down to the batch
 * you collected and work through it — and it does not fit beside "what needs
 * attention today".
 *
 * So the page leads with capture, defaults the source to a trade show, and
 * makes the source filter prominent, because after an event the only list that
 * matters is the people you met at it.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, Loader2, Plus, Search, Upload, UserPlus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

interface Lead {
  id: string
  businessName: string
  contactName: string | null
  email: string | null
  phone: string | null
  suburb: string | null
  industry: string | null
  source: string
  status: string
  estimatedValue: number | null
  createdAt: string
  owner: { name: string | null } | null
}

const SOURCES = [
  { value: "trade_show", label: "Trade show" },
  { value: "inbound", label: "Inbound" },
  { value: "referral", label: "Referral" },
  { value: "cold_call", label: "Cold call" },
  { value: "website", label: "Website" },
  { value: "campaign", label: "Campaign" },
]

const STATUSES = ["new", "contacted", "qualified", "converted", "lost"]

const STATUS_TONE: Record<string, string> = {
  new: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  contacted: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  qualified: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  converted: "bg-violet-500/10 text-violet-600 border-violet-500/20",
  lost: "bg-muted text-muted-foreground border-border",
}

const EMPTY = { businessName: "", contactName: "", email: "", phone: "", suburb: "", industry: "", notes: "" }

export default function LeadsPage() {
  const { toast } = useToast()

  const [leads, setLeads] = useState<Lead[]>([])
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("all")
  const [source, setSource] = useState("all")

  const [capturing, setCapturing] = useState(false)
  // Trade show is the default because it is where most of these come from, and
  // a default that is usually right removes a field from every capture.
  const [newSource, setNewSource] = useState("trade_show")
  const [form, setForm] = useState(EMPTY)

  const load = useCallback(async () => {
    setLoading(true)

    try {
      const params = new URLSearchParams({ view: "leads", pageSize: "100" })
      if (search.trim()) params.set("search", search.trim())
      if (status !== "all") params.set("status", status)
      if (source !== "all") params.set("source", source)

      const result = await fetch(`/api/crm?${params}`).then((response) => response.json())

      if (result.success) {
        setLeads(result.data.leads)
        setTotal(result.data.total)
        setStatusCounts(result.data.statusCounts || {})
        setSourceCounts(result.data.sourceCounts || {})
      }
    } finally {
      setLoading(false)
    }
  }, [search, status, source])

  /**
   * CSV import runs in two passes on purpose: analyse first, so the guessed
   * column mapping and the duplicate counts can be read before anything is
   * written. A trade-show list imported off an unreviewed guess is worse than
   * no list, because nobody goes back and checks.
   */
  const [analysis, setAnalysis] = useState<{
    headers: string[]
    mapping: Record<string, string | null>
    summary: {
      totalRows: number
      imported: number
      duplicatesInFile: number
      duplicatesExisting: number
      skipped: Array<{ row: number; reason: string; value?: string }>
    }
    preview: Array<Record<string, string>>
  } | null>(null)
  const [csvText, setCsvText] = useState("")
  const [csvName, setCsvName] = useState("")
  const [importing, setImporting] = useState(false)

  const analyseCsv = useCallback(
    async (text: string, fileName: string) => {
      setImporting(true)
      setAnalysis(null)

      try {
        const response = await fetch("/api/crm/leads/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv: text, mode: "analyse", source: source === "all" ? undefined : source }),
        })

        const result = await response.json()

        if (!result.success) {
          toast({ variant: "destructive", title: "Could not read that file", description: result.error })
          return
        }

        setCsvText(text)
        setCsvName(fileName)
        setAnalysis(result.data)
      } finally {
        setImporting(false)
      }
    },
    [source, toast]
  )

  const commitImport = useCallback(async () => {
    if (!csvText || !analysis) return

    setImporting(true)

    try {
      const response = await fetch("/api/crm/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csv: csvText,
          mode: "import",
          mapping: analysis.mapping,
          source: source === "all" ? undefined : source,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        toast({ variant: "destructive", title: "Import failed", description: result.error })
        return
      }

      const done = result.data.summary
      toast({
        title: `Imported ${done.imported} lead${done.imported === 1 ? "" : "s"}`,
        description:
          done.duplicatesExisting || done.duplicatesInFile
            ? `Skipped ${done.duplicatesExisting + done.duplicatesInFile} already on file or repeated in the sheet.`
            : undefined,
      })

      setAnalysis(null)
      setCsvText("")
      setCsvName("")
      await load()
    } finally {
      setImporting(false)
    }
  }, [analysis, csvText, load, source, toast])

  useEffect(() => {
    // Debounced, so typing a venue name does not fire a query per keystroke.
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
        toast({ variant: "destructive", title: "That did not work", description: result.error || "Unknown error" })
        return false
      }

      toast({ title: done })
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function capture() {
    if (!form.businessName.trim()) {
      toast({ variant: "destructive", title: "A lead needs a business name" })
      return
    }

    const saved = await act("createLead", { ...form, source: newSource }, `${form.businessName} added`)

    if (saved) {
      // The source is kept, because the next card in the pile is from the same
      // event. Everything else clears.
      setForm(EMPTY)
    }
  }

  const shown = useMemo(() => leads.length, [leads])

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Prospects who have not bought yet. Most arrive from a trade show — capture them here, then
            work the batch.
          </p>
        </div>

        <div className="flex gap-2">
          {/*
            A trade show produces one spreadsheet, not fifty conversations, so
            the file is the common case and typing them in is the exception.
          */}
          <Button variant="outline" asChild disabled={importing}>
            <label className="cursor-pointer">
              {importing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                className="sr-only"
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  if (!file) return

                  const contents = await file.text()
                  await analyseCsv(contents, file.name)
                  // Cleared so choosing the same file twice still fires.
                  event.target.value = ""
                }}
              />
            </label>
          </Button>

          <Button onClick={() => setCapturing((open) => !open)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {capturing ? "Close" : "Add a lead"}
          </Button>
        </div>
      </div>

      {/*
        Nothing is written until these numbers have been looked at. The mapping
        is a guess from the column headers, and a wrong guess silently files
        every phone number as a postcode.
      */}
      {analysis ? (
        <Card className="border-amber-300 dark:border-amber-800">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Check this before importing {csvName ? `— ${csvName}` : ""}
            </CardTitle>
            <CardDescription className="text-xs">
              {analysis.summary.totalRows} row{analysis.summary.totalRows === 1 ? "" : "s"} read.
              Nothing has been saved yet.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 text-xs">
            <div className="flex flex-wrap gap-4">
              <span>
                <span className="text-lg font-semibold">{analysis.summary.imported}</span> to import
              </span>
              <span className="text-muted-foreground">
                <span className="text-lg font-semibold">{analysis.summary.duplicatesExisting}</span> already on file
              </span>
              <span className="text-muted-foreground">
                <span className="text-lg font-semibold">{analysis.summary.duplicatesInFile}</span> repeated in the sheet
              </span>
            </div>

            <div>
              <p className="mb-1 font-medium">Columns it will use</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(analysis.mapping)
                  .filter(([, column]) => column)
                  .map(([field, column]) => (
                    <Badge key={field} variant="secondary" className="font-normal">
                      {field} ← {column}
                    </Badge>
                  ))}
              </div>
              {analysis.headers.some((header) => !Object.values(analysis.mapping).includes(header)) ? (
                <p className="mt-1.5 text-muted-foreground">
                  Ignored:{" "}
                  {analysis.headers
                    .filter((header) => !Object.values(analysis.mapping).includes(header))
                    .join(", ")}
                </p>
              ) : null}
            </div>

            {analysis.summary.skipped.length ? (
              <div>
                <p className="mb-1 font-medium">Skipped rows</p>
                <ul className="space-y-0.5 text-muted-foreground">
                  {analysis.summary.skipped.slice(0, 8).map((row) => (
                    <li key={`${row.row}-${row.value ?? ""}`}>
                      Row {row.row}: {row.reason}
                      {row.value ? ` — ${row.value}` : ""}
                    </li>
                  ))}
                  {analysis.summary.skipped.length > 8 ? (
                    <li>…and {analysis.summary.skipped.length - 8} more</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <div className="flex gap-2 pt-1">
              <Button size="sm" disabled={importing || !analysis.summary.imported} onClick={() => void commitImport()}>
                {importing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Import {analysis.summary.imported} lead{analysis.summary.imported === 1 ? "" : "s"}
              </Button>
              <Button size="sm" variant="ghost" disabled={importing} onClick={() => setAnalysis(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {capturing ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">New lead</CardTitle>
            <CardDescription>
              Only the business name is required. Everything else can be filled in later, and a card
              with a name is worth more than a form nobody finishes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Business name</Label>
                <Input
                  autoFocus
                  value={form.businessName}
                  onChange={(event) => setForm((f) => ({ ...f, businessName: event.target.value }))}
                  onKeyDown={(event) => event.key === "Enter" && capture()}
                  placeholder="Bella Napoli Pizzeria"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contact</Label>
                <Input
                  value={form.contactName}
                  onChange={(event) => setForm((f) => ({ ...f, contactName: event.target.value }))}
                  placeholder="Marco Esposito"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Where from</Label>
                <Select value={newSource} onValueChange={setNewSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((entry) => (
                      <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(event) => setForm((f) => ({ ...f, phone: event.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Suburb</Label>
                <Input
                  value={form.suburb}
                  onChange={(event) => setForm((f) => ({ ...f, suburb: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">What they said</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
                placeholder="Wants gluten-free bases. Currently buys through PFD."
              />
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={capture} disabled={busy || !form.businessName.trim()}>
                {busy ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <Plus className="mr-1.5 h-3 w-3" />}
                Save and add another
              </Button>
              <p className="text-xs text-muted-foreground">Enter saves. The source stays set for the next one.</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              {total} lead{total === 1 ? "" : "s"}
              {shown < total ? <span className="text-muted-foreground"> · showing {shown}</span> : null}
            </CardTitle>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 w-56 pl-7 text-xs"
                  placeholder="Search name, contact, suburb…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <Select value={source} onValueChange={setSource}>
                <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every source</SelectItem>
                  {SOURCES.map((entry) => (
                    <SelectItem key={entry.value} value={entry.value}>
                      {entry.label}
                      {sourceCounts[entry.value] ? ` (${sourceCounts[entry.value]})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any status</SelectItem>
                  {STATUSES.map((entry) => (
                    <SelectItem key={entry} value={entry}>
                      <span className="capitalize">{entry}</span>
                      {statusCounts[entry] ? ` (${statusCounts[entry]})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
          ) : leads.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium">
                {total === 0 ? "No leads yet" : "Nothing matches those filters"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {total === 0
                  ? "Add the cards from the last trade show and they will show up here."
                  : "Try a different source or status."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">Business</th>
                    <th className="pb-2 font-medium">Contact</th>
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Worth</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => (
                    <tr key={lead.id} className="border-b last:border-0">
                      <td className="py-2.5">
                        <p className="font-medium">{lead.businessName}</p>
                        {lead.suburb ? (
                          <p className="text-xs text-muted-foreground">{lead.suburb}</p>
                        ) : null}
                      </td>
                      <td className="py-2.5">
                        <p>{lead.contactName || <span className="text-muted-foreground">—</span>}</p>
                        {lead.email || lead.phone ? (
                          <p className="text-xs text-muted-foreground">{lead.email || lead.phone}</p>
                        ) : null}
                      </td>
                      <td className="py-2.5 text-xs capitalize text-muted-foreground">
                        {lead.source.replace(/_/g, " ")}
                      </td>
                      <td className="py-2.5">
                        <Select
                          value={lead.status}
                          onValueChange={(next) =>
                            act("updateLeadStatus", { leadId: lead.id, status: next }, `${lead.businessName} → ${next}`)
                          }
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <Badge variant="outline" className={`text-[10px] ${STATUS_TONE[lead.status] ?? ""}`}>
                              {lead.status}
                            </Badge>
                          </SelectTrigger>
                          <SelectContent>
                            {STATUSES.map((entry) => (
                              <SelectItem key={entry} value={entry} className="text-xs capitalize">
                                {entry}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-2.5 text-right text-xs">
                        {lead.estimatedValue ? `$${lead.estimatedValue.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2.5 text-right">
                        {lead.status !== "converted" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              act("convertLead", { leadId: lead.id }, `${lead.businessName} is now a customer`)
                            }
                          >
                            <UserPlus className="mr-1 h-3 w-3" />
                            Convert
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
