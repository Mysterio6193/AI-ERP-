"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  Building2,
  Database,
  Globe,
  Save,
  Settings2,
  Shield,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import {
  DEFAULT_COMMERCE_SETTINGS,
  type CommerceSettingsShape,
} from "@/lib/commerce"
import { formatCurrencyShort } from "@/lib/types"

interface CompanyData {
  name: string
  tradingName: string
  country: string
  abn: string
  acn: string
  gstin: string
  pan: string
  tanNumber: string
  cinNumber: string
  phone: string
  email: string
  website: string
  logoUrl: string
  address: string
  city: string
  state: string
  postcode: string
  bankName: string
  accountName: string
  accountNumber: string
  bsb: string
  ifscCode: string
  upiId: string
  invoiceFooter: string
  defaultTerms: string
  baseCurrency: string
  gstRegistered: boolean
  gstRate: number
  abnOnInvoices: boolean
  fiscalYearStart: number
  setupComplete: boolean
  onboardingStep: number
}

interface OrderLite {
  id: string
  totalAmount: number
  status: string
  sourceChannel?: string
}

interface CustomerLite {
  id: string
  status: string
}

interface InvoiceLite {
  id: string
  status: string
  outstandingAmt: number
}

const EMPTY_COMPANY: CompanyData = {
  name: "",
  tradingName: "",
  country: "AU",
  abn: "",
  acn: "",
  gstin: "",
  pan: "",
  tanNumber: "",
  cinNumber: "",
  phone: "",
  email: "",
  website: "",
  logoUrl: "",
  address: "",
  city: "",
  state: "",
  postcode: "",
  bankName: "",
  accountName: "",
  accountNumber: "",
  bsb: "",
  ifscCode: "",
  upiId: "",
  invoiceFooter: "",
  defaultTerms: "",
  baseCurrency: "AUD",
  gstRegistered: true,
  gstRate: 10,
  abnOnInvoices: true,
  fiscalYearStart: 7,
  setupComplete: false,
  onboardingStep: 0,
}

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
]

async function fetchPayload<T>(path: string): Promise<T | null> {
  const response = await fetch(path)
  const payload = await response.json()
  if (!payload.success) return null
  return payload.data ?? null
}

export default function SettingsPage() {
  const [companyData, setCompanyData] = useState<CompanyData>(EMPTY_COMPANY)
  const [commerce, setCommerce] = useState<CommerceSettingsShape>(DEFAULT_COMMERCE_SETTINGS)
  const [orders, setOrders] = useState<OrderLite[]>([])
  const [customers, setCustomers] = useState<CustomerLite[]>([])
  const [invoices, setInvoices] = useState<InvoiceLite[]>([])
  const [loading, setLoading] = useState(true)
  const [savingCompany, setSavingCompany] = useState(false)
  const [savingCommerce, setSavingCommerce] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [company, commerceSettings, nextOrders, nextCustomers, nextInvoices] = await Promise.all([
          fetchPayload<Partial<CompanyData>>("/api/settings/company"),
          fetchPayload<Partial<CommerceSettingsShape>>("/api/settings/commerce"),
          fetchPayload<OrderLite[]>("/api/orders"),
          fetchPayload<CustomerLite[]>("/api/customers"),
          fetchPayload<InvoiceLite[]>("/api/invoices"),
        ])

        setCompanyData({
          ...EMPTY_COMPANY,
          ...(company || {}),
        })
        setCommerce({
          ...DEFAULT_COMMERCE_SETTINGS,
          ...(commerceSettings || {}),
        })
        setOrders(nextOrders || [])
        setCustomers(nextCustomers || [])
        setInvoices(nextInvoices || [])
      } catch (error) {
        console.error("Error loading settings:", error)
        toast.error("Unable to load settings")
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [])

  const handleSaveCompany = async () => {
    try {
      setSavingCompany(true)
      const response = await fetch("/api/settings/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyData),
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to save company settings")
      }

      toast.success("Company settings updated")
    } catch (error) {
      console.error("Error saving company settings:", error)
      toast.error("Unable to save company settings")
    } finally {
      setSavingCompany(false)
    }
  }

  const handleSaveCommerce = async () => {
    try {
      setSavingCommerce(true)
      const response = await fetch("/api/settings/commerce", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(commerce),
      })

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || "Failed to save commerce settings")
      }

      setCommerce({
        ...DEFAULT_COMMERCE_SETTINGS,
        ...(data.data || {}),
      })
      toast.success("Commerce settings updated")
    } catch (error) {
      console.error("Error saving commerce settings:", error)
      toast.error("Unable to save commerce settings")
    } finally {
      setSavingCommerce(false)
    }
  }

  const operationalSummary = useMemo(() => {
    return {
      activeCustomers: customers.filter((customer) => customer.status === "active").length,
      openOrders: orders.filter((order) => !["draft", "cancelled", "delivered", "invoiced"].includes(order.status)).length,
      commerceOrders: orders.filter((order) => ["customer_web", "customer_app"].includes(order.sourceChannel || "")).length,
      outstandingReceivables: invoices
        .filter((invoice) => ["unpaid", "partial", "overdue"].includes(invoice.status))
        .reduce((sum, invoice) => sum + invoice.outstandingAmt, 0),
    }
  }, [customers, invoices, orders])

  const companyCompletion = useMemo(() => {
    const checkpoints = [
      companyData.name,
      companyData.email,
      companyData.phone,
      companyData.website,
      companyData.address,
      companyData.bankName,
      companyData.accountNumber,
      companyData.defaultTerms,
      companyData.invoiceFooter,
    ]
    return Math.round((checkpoints.filter(Boolean).length / checkpoints.length) * 100)
  }, [companyData])

  const commerceCompletion = useMemo(() => {
    const checkpoints = [
      commerce.websiteEnabled && commerce.websiteUrl,
      commerce.mobileAppEnabled && (commerce.playStoreUrl || commerce.appStoreUrl),
      commerce.supportEmail || commerce.supportPhone,
      commerce.heroTitle,
      commerce.primaryCtaLabel,
      commerce.supportHours,
      commerce.estimatedDeliveryWindow,
      commerce.seoTitle,
    ]
    return Math.round((checkpoints.filter(Boolean).length / checkpoints.length) * 100)
  }, [commerce])

  return (
    <AppShell title="Settings" breadcrumbs={[{ label: "Settings" }]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage company, finance, commerce, and deployment settings from one admin surface.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Company profile coverage</CardDescription>
              <CardTitle className="text-3xl">{companyCompletion}%</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Identity, contact, banking, and document defaults
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Commerce setup coverage</CardDescription>
              <CardTitle className="text-3xl">{commerceCompletion}%</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Website, app, support, merchandising, and SEO
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Commerce orders</CardDescription>
              <CardTitle className="text-3xl">{operationalSummary.commerceOrders}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Customer website and app orders visible in the OS dashboard
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outstanding receivables</CardDescription>
              <CardTitle className="text-3xl">{formatCurrencyShort(operationalSummary.outstandingReceivables)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Live unpaid or partially paid invoice balance
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="company" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="company"><Building2 className="mr-2 h-4 w-4" />Company</TabsTrigger>
            <TabsTrigger value="commerce"><Globe className="mr-2 h-4 w-4" />Commerce</TabsTrigger>
            <TabsTrigger value="operations"><Bell className="mr-2 h-4 w-4" />Operations</TabsTrigger>
            <TabsTrigger value="data"><Database className="mr-2 h-4 w-4" />System</TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Company profile and branding</CardTitle>
                <CardDescription>Everything used across invoices, documents, storefront touchpoints, and onboarding.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading ? <div className="text-sm text-muted-foreground">Loading company settings...</div> : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company name</Label>
                    <Input id="companyName" value={companyData.name} onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tradingName">Trading name</Label>
                    <Input id="tradingName" value={companyData.tradingName} onChange={(e) => setCompanyData({ ...companyData, tradingName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country">Country</Label>
                    <Select value={companyData.country} onValueChange={(value) => setCompanyData({ ...companyData, country: value })}>
                      <SelectTrigger id="country">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AU">Australia</SelectItem>
                        <SelectItem value="IN">India</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Logo URL</Label>
                    <Input id="logoUrl" value={companyData.logoUrl} onChange={(e) => setCompanyData({ ...companyData, logoUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={companyData.phone} onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={companyData.email} onChange={(e) => setCompanyData({ ...companyData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website">Website</Label>
                    <Input id="website" value={companyData.website} onChange={(e) => setCompanyData({ ...companyData, website: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="baseCurrency">Base currency</Label>
                    <Select value={companyData.baseCurrency} onValueChange={(value) => setCompanyData({ ...companyData, baseCurrency: value })}>
                      <SelectTrigger id="baseCurrency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AUD">AUD</SelectItem>
                        <SelectItem value="INR">INR</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2 xl:col-span-4">
                    <Label htmlFor="address">Address</Label>
                    <Textarea id="address" rows={2} value={companyData.address} onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input id="city" value={companyData.city} onChange={(e) => setCompanyData({ ...companyData, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input id="state" value={companyData.state} onChange={(e) => setCompanyData({ ...companyData, state: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postcode">Postcode</Label>
                    <Input id="postcode" value={companyData.postcode} onChange={(e) => setCompanyData({ ...companyData, postcode: e.target.value })} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tax, compliance, and banking</CardTitle>
                <CardDescription>Expose the legal, tax, and payout settings already supported by SupplySure OS.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="abn">ABN</Label>
                    <Input id="abn" value={companyData.abn} onChange={(e) => setCompanyData({ ...companyData, abn: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acn">ACN</Label>
                    <Input id="acn" value={companyData.acn} onChange={(e) => setCompanyData({ ...companyData, acn: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gstin">GSTIN</Label>
                    <Input id="gstin" value={companyData.gstin} onChange={(e) => setCompanyData({ ...companyData, gstin: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pan">PAN</Label>
                    <Input id="pan" value={companyData.pan} onChange={(e) => setCompanyData({ ...companyData, pan: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tanNumber">TAN</Label>
                    <Input id="tanNumber" value={companyData.tanNumber} onChange={(e) => setCompanyData({ ...companyData, tanNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cinNumber">CIN</Label>
                    <Input id="cinNumber" value={companyData.cinNumber} onChange={(e) => setCompanyData({ ...companyData, cinNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gstRate">Default GST rate (%)</Label>
                    <Input
                      id="gstRate"
                      type="number"
                      step="0.01"
                      value={companyData.gstRate}
                      onChange={(e) => setCompanyData({ ...companyData, gstRate: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fiscalYearStart">Fiscal year start</Label>
                    <Select
                      value={String(companyData.fiscalYearStart)}
                      onValueChange={(value) => setCompanyData({ ...companyData, fiscalYearStart: Number(value) })}
                    >
                      <SelectTrigger id="fiscalYearStart">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MONTH_OPTIONS.map((month) => (
                          <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">GST registered</p>
                        <p className="mt-1 text-sm text-muted-foreground">Use GST-ready invoice and tax behavior.</p>
                      </div>
                      <Switch
                        checked={companyData.gstRegistered}
                        onCheckedChange={(checked) => setCompanyData({ ...companyData, gstRegistered: checked })}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Show ABN on invoices</p>
                        <p className="mt-1 text-sm text-muted-foreground">Keep tax identifiers visible on customer documents.</p>
                      </div>
                      <Switch
                        checked={companyData.abnOnInvoices}
                        onCheckedChange={(checked) => setCompanyData({ ...companyData, abnOnInvoices: checked })}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Setup complete</p>
                        <p className="mt-1 text-sm text-muted-foreground">Mark onboarding as complete for live operations.</p>
                      </div>
                      <Switch
                        checked={companyData.setupComplete}
                        onCheckedChange={(checked) => setCompanyData({ ...companyData, setupComplete: checked })}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank name</Label>
                    <Input id="bankName" value={companyData.bankName} onChange={(e) => setCompanyData({ ...companyData, bankName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountName">Account name</Label>
                    <Input id="accountName" value={companyData.accountName} onChange={(e) => setCompanyData({ ...companyData, accountName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account number</Label>
                    <Input id="accountNumber" value={companyData.accountNumber} onChange={(e) => setCompanyData({ ...companyData, accountNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bsb">BSB / routing</Label>
                    <Input id="bsb" value={companyData.bsb} onChange={(e) => setCompanyData({ ...companyData, bsb: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ifscCode">IFSC code</Label>
                    <Input id="ifscCode" value={companyData.ifscCode} onChange={(e) => setCompanyData({ ...companyData, ifscCode: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="upiId">UPI ID</Label>
                    <Input id="upiId" value={companyData.upiId} onChange={(e) => setCompanyData({ ...companyData, upiId: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboardingStep">Onboarding step</Label>
                    <Input
                      id="onboardingStep"
                      type="number"
                      min="0"
                      value={companyData.onboardingStep}
                      onChange={(e) => setCompanyData({ ...companyData, onboardingStep: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Document defaults</CardTitle>
                <CardDescription>Control what goes out on quotes, invoices, and customer-facing paperwork.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultTerms">Default terms and conditions</Label>
                  <Textarea
                    id="defaultTerms"
                    rows={4}
                    value={companyData.defaultTerms}
                    onChange={(e) => setCompanyData({ ...companyData, defaultTerms: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceFooter">Invoice footer</Label>
                  <Textarea
                    id="invoiceFooter"
                    rows={4}
                    value={companyData.invoiceFooter}
                    onChange={(e) => setCompanyData({ ...companyData, invoiceFooter: e.target.value })}
                  />
                </div>

                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSaveCompany} disabled={savingCompany}>
                  <Save className="mr-2 h-4 w-4" />
                  {savingCompany ? "Saving..." : "Save Company Settings"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commerce" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Channel, support, and policy controls</CardTitle>
                <CardDescription>Keep the customer website and app fully manageable from admin without leaving settings.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Website live</p>
                        <p className="mt-1 text-sm text-muted-foreground">Allow customers to browse and order on the website.</p>
                      </div>
                      <Switch checked={commerce.websiteEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, websiteEnabled: checked })} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Mobile app live</p>
                        <p className="mt-1 text-sm text-muted-foreground">Allow customer ordering from iOS and Android.</p>
                      </div>
                      <Switch checked={commerce.mobileAppEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, mobileAppEnabled: checked })} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Maintenance mode</p>
                        <p className="mt-1 text-sm text-muted-foreground">Pause ordering while keeping the admin dashboard live.</p>
                      </div>
                      <Switch checked={commerce.maintenanceMode} onCheckedChange={(checked) => setCommerce({ ...commerce, maintenanceMode: checked })} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Auto-approve orders</p>
                        <p className="mt-1 text-sm text-muted-foreground">Push customer orders straight into fulfilment.</p>
                      </div>
                      <Switch checked={commerce.autoApproveOrders} onCheckedChange={(checked) => setCommerce({ ...commerce, autoApproveOrders: checked })} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Inventory sync</p>
                        <p className="mt-1 text-sm text-muted-foreground">Use OS inventory as the storefront source of truth.</p>
                      </div>
                      <Switch checked={commerce.inventorySyncEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, inventorySyncEnabled: checked })} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Show out-of-stock items</p>
                        <p className="mt-1 text-sm text-muted-foreground">Let customers discover unavailable items without ordering them.</p>
                      </div>
                      <Switch checked={commerce.showOutOfStock} onCheckedChange={(checked) => setCommerce({ ...commerce, showOutOfStock: checked })} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4 md:col-span-2 xl:col-span-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">Guest checkout</p>
                        <p className="mt-1 text-sm text-muted-foreground">Allow ordering without a full account, or keep checkout account-only for B2B control.</p>
                      </div>
                      <Switch checked={commerce.guestCheckoutEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, guestCheckoutEnabled: checked })} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="websiteUrl">Website URL</Label>
                    <Input id="websiteUrl" value={commerce.websiteUrl || ""} onChange={(e) => setCommerce({ ...commerce, websiteUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="playStoreUrl">Play Store URL</Label>
                    <Input id="playStoreUrl" value={commerce.playStoreUrl || ""} onChange={(e) => setCommerce({ ...commerce, playStoreUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="appStoreUrl">App Store URL</Label>
                    <Input id="appStoreUrl" value={commerce.appStoreUrl || ""} onChange={(e) => setCommerce({ ...commerce, appStoreUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail">Support email</Label>
                    <Input id="supportEmail" value={commerce.supportEmail || ""} onChange={(e) => setCommerce({ ...commerce, supportEmail: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportPhone">Support phone</Label>
                    <Input id="supportPhone" value={commerce.supportPhone || ""} onChange={(e) => setCommerce({ ...commerce, supportPhone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportHours">Support hours</Label>
                    <Input id="supportHours" value={commerce.supportHours || ""} onChange={(e) => setCommerce({ ...commerce, supportHours: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="heroTitle">Hero title</Label>
                    <Input id="heroTitle" value={commerce.heroTitle || ""} onChange={(e) => setCommerce({ ...commerce, heroTitle: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="primaryCtaLabel">Primary CTA label</Label>
                    <Input id="primaryCtaLabel" value={commerce.primaryCtaLabel || ""} onChange={(e) => setCommerce({ ...commerce, primaryCtaLabel: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="primaryCtaHref">Primary CTA link</Label>
                    <Input id="primaryCtaHref" value={commerce.primaryCtaHref || ""} onChange={(e) => setCommerce({ ...commerce, primaryCtaHref: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimumOrderAmount">Minimum order amount</Label>
                    <Input
                      id="minimumOrderAmount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={commerce.minimumOrderAmount}
                      onChange={(e) => setCommerce({ ...commerce, minimumOrderAmount: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="freeDeliveryThreshold">Free delivery threshold</Label>
                    <Input
                      id="freeDeliveryThreshold"
                      type="number"
                      min="0"
                      step="0.01"
                      value={commerce.freeDeliveryThreshold}
                      onChange={(e) => setCommerce({ ...commerce, freeDeliveryThreshold: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="featuredCategoryIds">Featured category ids</Label>
                    <Input
                      id="featuredCategoryIds"
                      value={commerce.featuredCategoryIds || ""}
                      onChange={(e) => setCommerce({ ...commerce, featuredCategoryIds: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2 xl:col-span-3">
                    <Label htmlFor="heroSubtitle">Hero subtitle</Label>
                    <Textarea
                      id="heroSubtitle"
                      rows={3}
                      value={commerce.heroSubtitle || ""}
                      onChange={(e) => setCommerce({ ...commerce, heroSubtitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estimatedDeliveryWindow">Delivery promise</Label>
                    <Input
                      id="estimatedDeliveryWindow"
                      value={commerce.estimatedDeliveryWindow || ""}
                      onChange={(e) => setCommerce({ ...commerce, estimatedDeliveryWindow: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2 xl:col-span-3">
                    <Label htmlFor="returnsPolicySummary">Returns policy summary</Label>
                    <Textarea
                      id="returnsPolicySummary"
                      rows={3}
                      value={commerce.returnsPolicySummary || ""}
                      onChange={(e) => setCommerce({ ...commerce, returnsPolicySummary: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seoTitle">SEO title</Label>
                    <Input id="seoTitle" value={commerce.seoTitle || ""} onChange={(e) => setCommerce({ ...commerce, seoTitle: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="seoDescription">SEO description</Label>
                    <Textarea
                      id="seoDescription"
                      rows={3}
                      value={commerce.seoDescription || ""}
                      onChange={(e) => setCommerce({ ...commerce, seoDescription: e.target.value })}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">Announcement bar</p>
                      <p className="text-sm text-muted-foreground">Push a promo, delivery update, or service notice to the customer storefront.</p>
                    </div>
                    <Switch checked={commerce.announcementEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, announcementEnabled: checked })} />
                  </div>
                  <Textarea
                    rows={3}
                    value={commerce.announcementText || ""}
                    onChange={(e) => setCommerce({ ...commerce, announcementText: e.target.value })}
                    placeholder="Free delivery on orders over $100 this week."
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button className="bg-cyan-600 hover:bg-cyan-700" onClick={handleSaveCommerce} disabled={savingCommerce}>
                    <Save className="mr-2 h-4 w-4" />
                    {savingCommerce ? "Saving..." : "Save Commerce Settings"}
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/commerce">
                      <Settings2 className="mr-2 h-4 w-4" />
                      Open Full Commerce Page
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operations" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Active customers</CardDescription>
                  <CardTitle className="text-2xl">{operationalSummary.activeCustomers}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Open orders</CardDescription>
                  <CardTitle className="text-2xl">{operationalSummary.openOrders}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Commerce orders</CardDescription>
                  <CardTitle className="text-2xl">{operationalSummary.commerceOrders}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Outstanding AR</CardDescription>
                  <CardTitle className="text-2xl">{formatCurrencyShort(operationalSummary.outstandingReceivables)}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Operational readiness</CardTitle>
                <CardDescription>Keep the admin stack live, channel-aware, and ready for a deployment handoff.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-600" />
                    <p className="font-medium text-slate-900">Admin environment</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    SupplySure OS is now tracking internal orders plus customer website and app orders in the same operating flow.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-cyan-600" />
                    <p className="font-medium text-slate-900">Commerce posture</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Website is {commerce.websiteEnabled ? "enabled" : "disabled"}, mobile is {commerce.mobileAppEnabled ? "enabled" : "disabled"}, and maintenance mode is {commerce.maintenanceMode ? "on" : "off"}.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-blue-600" />
                    <p className="font-medium text-slate-900">Support and escalation</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Support handoff is currently {commerce.supportEmail || commerce.supportPhone ? "configured" : "missing"} for customer-facing channels.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-violet-600" />
                    <p className="font-medium text-slate-900">Company readiness</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Company profile is {companyCompletion}% complete, with onboarding step {companyData.onboardingStep} and setup marked {companyData.setupComplete ? "complete" : "in progress"}.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>System and deployment notes</CardTitle>
                <CardDescription>Keep the operational, data, and deployment state honest inside the dashboard.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">Database coverage</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Company, commerce, customer sessions, carts, and channel-aware orders are persisted in the live schema instead of browser-only state.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">Deployment handoff</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Final production launch still depends on real payment credentials, production domains, and store-console accounts, but the settings surface now captures the main operational fields.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">Commerce SEO and policy coverage</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    SEO title, SEO description, returns summary, support hours, delivery promise, and order thresholds can now be managed directly from admin settings.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge className={commerce.websiteEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>Website {commerce.websiteEnabled ? "enabled" : "disabled"}</Badge>
                  <Badge className={commerce.mobileAppEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>Mobile {commerce.mobileAppEnabled ? "enabled" : "disabled"}</Badge>
                  <Badge className={commerce.guestCheckoutEnabled ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"}>Guest checkout {commerce.guestCheckoutEnabled ? "on" : "off"}</Badge>
                  <Badge className={companyData.gstRegistered ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}>GST {companyData.gstRegistered ? "registered" : "not registered"}</Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}
