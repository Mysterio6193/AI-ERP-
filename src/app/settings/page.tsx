"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import {
  Bell,
  Building2,
  CheckCircle2,
  Database,
  Globe,
  Loader2,
  Save,
  Settings2,
  Shield,
  ShoppingBag,
  Users,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { KpiCard } from "@/components/ui/kpi-card"
import { Label } from "@/components/ui/label"
import { PageHeader } from "@/components/ui/page-header"
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
        <PageHeader
          title="Organization Settings"
          description="Manage company profile, tax compliance, storefront channels, and ERP deployment parameters."
        />

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title="Company Profile"
            value={`${companyCompletion}%`}
            description="Identity, tax, banking & document defaults"
            icon={Building2}
          />
          <KpiCard
            title="Commerce Setup"
            value={`${commerceCompletion}%`}
            description="Website, app, support, merchandising & SEO"
            icon={Globe}
          />
          <KpiCard
            title="Commerce Orders"
            value={operationalSummary.commerceOrders}
            description="Live website & mobile app order stream"
            icon={ShoppingBag}
          />
          <KpiCard
            title="Outstanding AR"
            value={formatCurrencyShort(operationalSummary.outstandingReceivables)}
            description="Live unpaid or partially paid receivables"
            icon={Shield}
          />
        </div>

        <Tabs defaultValue="company" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 bg-muted p-1">
            <TabsTrigger value="company" className="gap-2">
              <Building2 className="h-4 w-4" />
              Company
            </TabsTrigger>
            <TabsTrigger value="commerce" className="gap-2">
              <Globe className="h-4 w-4" />
              Commerce
            </TabsTrigger>
            <TabsTrigger value="operations" className="gap-2">
              <Bell className="h-4 w-4" />
              Operations
            </TabsTrigger>
            <TabsTrigger value="data" className="gap-2">
              <Database className="h-4 w-4" />
              System
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="space-y-4">
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg">Company Profile & Legal Identity</CardTitle>
                <CardDescription>Legal entity details used across invoices, tax filings, and document headers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {loading ? <div className="text-sm text-muted-foreground">Loading company settings...</div> : null}

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="text-xs font-medium">Company name</Label>
                    <Input id="companyName" value={companyData.name} onChange={(e) => setCompanyData({ ...companyData, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tradingName" className="text-xs font-medium">Trading name</Label>
                    <Input id="tradingName" value={companyData.tradingName} onChange={(e) => setCompanyData({ ...companyData, tradingName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="country" className="text-xs font-medium">Country</Label>
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
                    <Label htmlFor="logoUrl" className="text-xs font-medium">Logo URL</Label>
                    <Input id="logoUrl" value={companyData.logoUrl} onChange={(e) => setCompanyData({ ...companyData, logoUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-xs font-medium">Phone</Label>
                    <Input id="phone" value={companyData.phone} onChange={(e) => setCompanyData({ ...companyData, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-medium">Email</Label>
                    <Input id="email" type="email" value={companyData.email} onChange={(e) => setCompanyData({ ...companyData, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="website" className="text-xs font-medium">Website</Label>
                    <Input id="website" value={companyData.website} onChange={(e) => setCompanyData({ ...companyData, website: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="baseCurrency" className="text-xs font-medium">Base currency</Label>
                    <Select value={companyData.baseCurrency} onValueChange={(value) => setCompanyData({ ...companyData, baseCurrency: value })}>
                      <SelectTrigger id="baseCurrency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AUD">AUD ($)</SelectItem>
                        <SelectItem value="INR">INR (₹)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2 xl:col-span-4">
                    <Label htmlFor="address" className="text-xs font-medium">Street address</Label>
                    <Textarea id="address" rows={2} value={companyData.address} onChange={(e) => setCompanyData({ ...companyData, address: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city" className="text-xs font-medium">City</Label>
                    <Input id="city" value={companyData.city} onChange={(e) => setCompanyData({ ...companyData, city: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state" className="text-xs font-medium">State / Province</Label>
                    <Input id="state" value={companyData.state} onChange={(e) => setCompanyData({ ...companyData, state: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postcode" className="text-xs font-medium">Postal / ZIP code</Label>
                    <Input id="postcode" value={companyData.postcode} onChange={(e) => setCompanyData({ ...companyData, postcode: e.target.value })} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg">Tax, Compliance & Bank Settlement</CardTitle>
                <CardDescription>Tax registration numbers, banking details, and fiscal calendars.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="abn" className="text-xs font-medium">ABN (Australia)</Label>
                    <Input id="abn" value={companyData.abn} onChange={(e) => setCompanyData({ ...companyData, abn: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="acn" className="text-xs font-medium">ACN (Australia)</Label>
                    <Input id="acn" value={companyData.acn} onChange={(e) => setCompanyData({ ...companyData, acn: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gstin" className="text-xs font-medium">GSTIN (India)</Label>
                    <Input id="gstin" value={companyData.gstin} onChange={(e) => setCompanyData({ ...companyData, gstin: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pan" className="text-xs font-medium">PAN (India)</Label>
                    <Input id="pan" value={companyData.pan} onChange={(e) => setCompanyData({ ...companyData, pan: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tanNumber" className="text-xs font-medium">TAN</Label>
                    <Input id="tanNumber" value={companyData.tanNumber} onChange={(e) => setCompanyData({ ...companyData, tanNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cinNumber" className="text-xs font-medium">CIN</Label>
                    <Input id="cinNumber" value={companyData.cinNumber} onChange={(e) => setCompanyData({ ...companyData, cinNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gstRate" className="text-xs font-medium">Default GST rate (%)</Label>
                    <Input
                      id="gstRate"
                      type="number"
                      step="0.01"
                      value={companyData.gstRate}
                      onChange={(e) => setCompanyData({ ...companyData, gstRate: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fiscalYearStart" className="text-xs font-medium">Fiscal year start</Label>
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
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">GST registered</p>
                        <p className="mt-1 text-xs text-muted-foreground">Enables automated GST calculation and tax invoice formatting.</p>
                      </div>
                      <Switch
                        checked={companyData.gstRegistered}
                        onCheckedChange={(checked) => setCompanyData({ ...companyData, gstRegistered: checked })}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Display ABN / Tax ID on invoices</p>
                        <p className="mt-1 text-xs text-muted-foreground">Keep official tax registration visible on customer receipts.</p>
                      </div>
                      <Switch
                        checked={companyData.abnOnInvoices}
                        onCheckedChange={(checked) => setCompanyData({ ...companyData, abnOnInvoices: checked })}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Organization onboarding complete</p>
                        <p className="mt-1 text-xs text-muted-foreground">Unlocks live multi-user operating status.</p>
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
                    <Label htmlFor="bankName" className="text-xs font-medium">Bank name</Label>
                    <Input id="bankName" value={companyData.bankName} onChange={(e) => setCompanyData({ ...companyData, bankName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountName" className="text-xs font-medium">Account name</Label>
                    <Input id="accountName" value={companyData.accountName} onChange={(e) => setCompanyData({ ...companyData, accountName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber" className="text-xs font-medium">Account number</Label>
                    <Input id="accountNumber" value={companyData.accountNumber} onChange={(e) => setCompanyData({ ...companyData, accountNumber: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bsb" className="text-xs font-medium">BSB / Routing code</Label>
                    <Input id="bsb" value={companyData.bsb} onChange={(e) => setCompanyData({ ...companyData, bsb: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ifscCode" className="text-xs font-medium">IFSC code (India)</Label>
                    <Input id="ifscCode" value={companyData.ifscCode} onChange={(e) => setCompanyData({ ...companyData, ifscCode: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="upiId" className="text-xs font-medium">UPI ID (India)</Label>
                    <Input id="upiId" value={companyData.upiId} onChange={(e) => setCompanyData({ ...companyData, upiId: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="onboardingStep" className="text-xs font-medium">Onboarding step index</Label>
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

            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg">Document Terms & Footers</CardTitle>
                <CardDescription>Default terms and payment instructions printed on invoices, quotes, and packing slips.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultTerms" className="text-xs font-medium">Standard terms & conditions</Label>
                  <Textarea
                    id="defaultTerms"
                    rows={4}
                    value={companyData.defaultTerms}
                    onChange={(e) => setCompanyData({ ...companyData, defaultTerms: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceFooter" className="text-xs font-medium">Invoice footer & payment remittance notes</Label>
                  <Textarea
                    id="invoiceFooter"
                    rows={4}
                    value={companyData.invoiceFooter}
                    onChange={(e) => setCompanyData({ ...companyData, invoiceFooter: e.target.value })}
                  />
                </div>

                <div className="pt-2">
                  <Button onClick={handleSaveCompany} disabled={savingCompany}>
                    {savingCompany ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {savingCompany ? "Saving..." : "Save Company Settings"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="commerce" className="space-y-4">
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg">Channel, Merchandising & Storefront Controls</CardTitle>
                <CardDescription>Configure customer website, iOS/Android mobile ordering, and inventory sync parameters.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Customer website</p>
                        <p className="mt-1 text-xs text-muted-foreground">Allow customers to browse catalogue and place orders online.</p>
                      </div>
                      <Switch checked={commerce.websiteEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, websiteEnabled: checked })} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Customer mobile apps</p>
                        <p className="mt-1 text-xs text-muted-foreground">Allow ordering via iOS and Android native client apps.</p>
                      </div>
                      <Switch checked={commerce.mobileAppEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, mobileAppEnabled: checked })} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Maintenance mode</p>
                        <p className="mt-1 text-xs text-muted-foreground">Temporarily pause storefront ordering while preserving admin access.</p>
                      </div>
                      <Switch checked={commerce.maintenanceMode} onCheckedChange={(checked) => setCommerce({ ...commerce, maintenanceMode: checked })} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Auto-approve orders</p>
                        <p className="mt-1 text-xs text-muted-foreground">Instantly allocate stock and forward web orders to warehouse fulfillment.</p>
                      </div>
                      <Switch checked={commerce.autoApproveOrders} onCheckedChange={(checked) => setCommerce({ ...commerce, autoApproveOrders: checked })} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Real-time inventory sync</p>
                        <p className="mt-1 text-xs text-muted-foreground">Use live warehouse stock levels as storefront source of truth.</p>
                      </div>
                      <Switch checked={commerce.inventorySyncEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, inventorySyncEnabled: checked })} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Show out-of-stock items</p>
                        <p className="mt-1 text-xs text-muted-foreground">Allow catalog discovery of unavailable items with backorder badges.</p>
                      </div>
                      <Switch checked={commerce.showOutOfStock} onCheckedChange={(checked) => setCommerce({ ...commerce, showOutOfStock: checked })} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-4 md:col-span-2 xl:col-span-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Guest checkout</p>
                        <p className="mt-1 text-xs text-muted-foreground">Allow orders without permanent account registration, or require authenticated B2B accounts.</p>
                      </div>
                      <Switch checked={commerce.guestCheckoutEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, guestCheckoutEnabled: checked })} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="websiteUrl" className="text-xs font-medium">Storefront domain URL</Label>
                    <Input id="websiteUrl" value={commerce.websiteUrl || ""} onChange={(e) => setCommerce({ ...commerce, websiteUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="playStoreUrl" className="text-xs font-medium">Google Play Store URL</Label>
                    <Input id="playStoreUrl" value={commerce.playStoreUrl || ""} onChange={(e) => setCommerce({ ...commerce, playStoreUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="appStoreUrl" className="text-xs font-medium">Apple App Store URL</Label>
                    <Input id="appStoreUrl" value={commerce.appStoreUrl || ""} onChange={(e) => setCommerce({ ...commerce, appStoreUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail" className="text-xs font-medium">Support email</Label>
                    <Input id="supportEmail" value={commerce.supportEmail || ""} onChange={(e) => setCommerce({ ...commerce, supportEmail: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportPhone" className="text-xs font-medium">Support phone</Label>
                    <Input id="supportPhone" value={commerce.supportPhone || ""} onChange={(e) => setCommerce({ ...commerce, supportPhone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportHours" className="text-xs font-medium">Support operating hours</Label>
                    <Input id="supportHours" value={commerce.supportHours || ""} onChange={(e) => setCommerce({ ...commerce, supportHours: e.target.value })} />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="heroTitle" className="text-xs font-medium">Storefront hero title</Label>
                    <Input id="heroTitle" value={commerce.heroTitle || ""} onChange={(e) => setCommerce({ ...commerce, heroTitle: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="primaryCtaLabel" className="text-xs font-medium">Primary CTA button label</Label>
                    <Input id="primaryCtaLabel" value={commerce.primaryCtaLabel || ""} onChange={(e) => setCommerce({ ...commerce, primaryCtaLabel: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="primaryCtaHref" className="text-xs font-medium">Primary CTA target link</Label>
                    <Input id="primaryCtaHref" value={commerce.primaryCtaHref || ""} onChange={(e) => setCommerce({ ...commerce, primaryCtaHref: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="minimumOrderAmount" className="text-xs font-medium">Minimum order amount ($)</Label>
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
                    <Label htmlFor="freeDeliveryThreshold" className="text-xs font-medium">Free delivery threshold ($)</Label>
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
                    <Label htmlFor="featuredCategoryIds" className="text-xs font-medium">Featured category IDs (comma-separated)</Label>
                    <Input
                      id="featuredCategoryIds"
                      value={commerce.featuredCategoryIds || ""}
                      onChange={(e) => setCommerce({ ...commerce, featuredCategoryIds: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2 xl:col-span-3">
                    <Label htmlFor="heroSubtitle" className="text-xs font-medium">Storefront hero subtitle</Label>
                    <Textarea
                      id="heroSubtitle"
                      rows={3}
                      value={commerce.heroSubtitle || ""}
                      onChange={(e) => setCommerce({ ...commerce, heroSubtitle: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estimatedDeliveryWindow" className="text-xs font-medium">Delivery promise window</Label>
                    <Input
                      id="estimatedDeliveryWindow"
                      value={commerce.estimatedDeliveryWindow || ""}
                      onChange={(e) => setCommerce({ ...commerce, estimatedDeliveryWindow: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2 xl:col-span-3">
                    <Label htmlFor="returnsPolicySummary" className="text-xs font-medium">Returns policy summary</Label>
                    <Textarea
                      id="returnsPolicySummary"
                      rows={3}
                      value={commerce.returnsPolicySummary || ""}
                      onChange={(e) => setCommerce({ ...commerce, returnsPolicySummary: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="seoTitle" className="text-xs font-medium">SEO meta title</Label>
                    <Input id="seoTitle" value={commerce.seoTitle || ""} onChange={(e) => setCommerce({ ...commerce, seoTitle: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="seoDescription" className="text-xs font-medium">SEO meta description</Label>
                    <Textarea
                      id="seoDescription"
                      rows={3}
                      value={commerce.seoDescription || ""}
                      onChange={(e) => setCommerce({ ...commerce, seoDescription: e.target.value })}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border bg-card p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">Announcement banner bar</p>
                      <p className="text-xs text-muted-foreground">Broadcast an urgent promotion, delivery update, or holiday hours to customer storefronts.</p>
                    </div>
                    <Switch checked={commerce.announcementEnabled} onCheckedChange={(checked) => setCommerce({ ...commerce, announcementEnabled: checked })} />
                  </div>
                  <Textarea
                    rows={2}
                    value={commerce.announcementText || ""}
                    onChange={(e) => setCommerce({ ...commerce, announcementText: e.target.value })}
                    placeholder="Free delivery on orders over $150 this week. Order by 2pm for same-day dispatch."
                  />
                </div>

                <div className="flex flex-wrap gap-3 pt-2">
                  <Button onClick={handleSaveCommerce} disabled={savingCommerce}>
                    {savingCommerce ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {savingCommerce ? "Saving..." : "Save Commerce Settings"}
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/commerce">
                      <Settings2 className="mr-2 h-4 w-4" />
                      Open Full Commerce Workspace
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="operations" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard title="Active Customers" value={operationalSummary.activeCustomers} description="Accounts with recent trade" icon={Users} />
              <KpiCard title="Open Orders" value={operationalSummary.openOrders} description="Orders active in fulfillment" icon={ShoppingBag} />
              <KpiCard title="Commerce Orders" value={operationalSummary.commerceOrders} description="Placed through website or mobile" icon={Globe} />
              <KpiCard title="Outstanding AR" value={formatCurrencyShort(operationalSummary.outstandingReceivables)} description="Unpaid invoice balance" icon={Shield} />
            </div>

            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg">Operational Readiness & Health Check</CardTitle>
                <CardDescription>Unified status across internal ERP channels and customer-facing storefronts.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-emerald-500" />
                    <p className="text-sm font-medium text-foreground">Admin Environment</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    SupplySure OS is actively orchestrating ERP data, tracking multi-channel sales orders, and automating inventory ledger reservations.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-sky-500" />
                    <p className="text-sm font-medium text-foreground">Commerce Posture</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Website is {commerce.websiteEnabled ? "live" : "disabled"}, mobile apps are {commerce.mobileAppEnabled ? "live" : "disabled"}, and maintenance mode is {commerce.maintenanceMode ? "active" : "inactive"}.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-amber-500" />
                    <p className="text-sm font-medium text-foreground">Support & Escalations</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Customer support contact is currently {commerce.supportEmail || commerce.supportPhone ? "configured and operational" : "unconfigured"} for customer-facing channels.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-violet-500" />
                    <p className="text-sm font-medium text-foreground">Company Entity Readiness</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Company profile is {companyCompletion}% complete with onboarding step {companyData.onboardingStep} and status marked {companyData.setupComplete ? "completed" : "in progress"}.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="data" className="space-y-4">
            <Card className="border border-border">
              <CardHeader>
                <CardTitle className="text-lg">System & Database Architecture</CardTitle>
                <CardDescription>Core persistence topology, multi-channel order reconciliation, and deployment flags.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">Prisma & SQLite/PostgreSQL Database Coverage</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    All entity configurations, commerce parameters, customer auth tokens, shopping carts, and order ledgers are ACID-compliant and stored in the unified database schema.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">Production Deployment Readiness</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Production launch parameters, HMAC session verification, Stripe webhooks, and telegram bot connections are managed securely through environment variables and the integrations console.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant={commerce.websiteEnabled ? "default" : "secondary"}>
                    Website {commerce.websiteEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Badge variant={commerce.mobileAppEnabled ? "default" : "secondary"}>
                    Mobile {commerce.mobileAppEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Badge variant={commerce.guestCheckoutEnabled ? "secondary" : "outline"}>
                    Guest Checkout {commerce.guestCheckoutEnabled ? "Active" : "Account-only"}
                  </Badge>
                  <Badge variant={companyData.gstRegistered ? "default" : "secondary"}>
                    GST {companyData.gstRegistered ? "Registered" : "Not Registered"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  )
}

