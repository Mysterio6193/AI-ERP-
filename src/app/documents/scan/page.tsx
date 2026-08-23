"use client"

import { useState, useRef } from "react"
import {
  Camera,
  Check,
  Cpu,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  ScanLine,
  Upload,
} from "lucide-react"

import { AppShell } from "@/components/layout/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import type { ExtractedDocument } from "@/lib/ocr/engine"

const OCR_MODEL_PRESETS = [
  { label: "Nemotron Nano 12B VL (100% Free)", value: "nvidia/nemotron-nano-12b-v2-vl:free" },
  { label: "Gemini 2.5 Flash", value: "google/gemini-2.5-flash" },
  { label: "Claude 3.5 Sonnet", value: "anthropic/claude-3.5-sonnet" },
  { label: "DeepSeek Chat", value: "deepseek/deepseek-chat" },
]

export default function DocumentScanPage() {
  const { toast } = useToast()
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [selectedModel, setSelectedModel] = useState(OCR_MODEL_PRESETS[0].value)
  const [customModel, setCustomModel] = useState("")
  const [result, setResult] = useState<ExtractedDocument | null>(null)
  const [creatingPo, setCreatingPo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(selected: File | null) {
    if (!selected) return
    setFile(selected)
    setResult(null)
    const objectUrl = URL.createObjectURL(selected)
    setPreviewUrl(objectUrl)
  }

  async function runScan() {
    if (!file) return

    setScanning(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("model", customModel.trim() || selectedModel)

      const response = await fetch("/api/ocr/scan", {
        method: "POST",
        body: formData,
      })

      const payload = await response.json()
      if (payload.success) {
        setResult(payload.data)
        toast({
          title: "OCR Extraction Complete",
          description: `Extracted ${payload.data.items?.length || 0} line items from ${payload.data.vendorName || "document"}.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "OCR Scan Failed",
          description: payload.error || "Failed to parse document",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Scanning Error",
        description: error instanceof Error ? error.message : "Network error",
      })
    } finally {
      setScanning(false)
    }
  }

  async function createPurchaseOrder() {
    if (!result) return
    setCreatingPo(true)

    try {
      const response = await fetch("/api/purchasing/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: result.matchedSupplierId || undefined,
          supplierName: result.vendorName || "Unknown Supplier",
          supplierReference: result.documentNumber || undefined,
          notes: `Auto-generated via Vision OCR Scanner from ${result.documentType || "document"}. Document Date: ${result.documentDate || "N/A"}`,
          items: result.items.map((item) => ({
            productId: item.matchedProductId,
            description: item.description,
            sku: item.sku,
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
          })),
        }),
      })

      const payload = await response.json()
      if (payload.success) {
        toast({
          title: "Purchase Order Created",
          description: `Created PO #${payload.data?.poNumber || ""} with ${result.items.length} lines.`,
        })
      } else {
        toast({
          variant: "destructive",
          title: "PO Creation Failed",
          description: payload.error || "Could not create PO",
        })
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create PO",
      })
    } finally {
      setCreatingPo(false)
    }
  }

  return (
    <AppShell title="Document Intelligence & OCR Scanner">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Vision OCR & Document Scanner</h1>
            <p className="text-sm text-muted-foreground">
              Extract supplier invoices, delivery dockets, bills of lading, and receipts into structured ERP records.
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-12">
          {/* Upload & Controls */}
          <div className="space-y-4 lg:col-span-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Upload Document</CardTitle>
                <CardDescription>
                  Select a photo, scanned image (JPG, PNG, WebP) or invoice document.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                    file ? "border-primary/50 bg-primary/5" : "border-muted-foreground/20 hover:border-primary/40"
                  }`}
                >
                  {previewUrl ? (
                    <div className="space-y-2">
                      <img
                        src={previewUrl}
                        alt="Document Preview"
                        className="max-h-56 rounded-lg object-contain shadow-sm"
                      />
                      <p className="font-mono text-xs text-muted-foreground">{file?.name}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                        <Upload className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium">Click to upload or drag & drop</p>
                      <p className="text-xs text-muted-foreground">Invoices, Delivery Dockets, Receipts, BOLs</p>
                    </div>
                  )}
                </div>

                {/* Model Selector */}
                <div className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    <p className="text-xs font-medium">Vision OCR Model</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {OCR_MODEL_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => {
                          setSelectedModel(preset.value)
                          setCustomModel("")
                        }}
                        className={`rounded border px-2 py-1 text-[10px] transition-colors ${
                          selectedModel === preset.value && !customModel
                            ? "border-primary bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <Input
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="Or custom OpenRouter Vision model..."
                    className="h-8 font-mono text-xs"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={!file || scanning}
                  onClick={runScan}
                >
                  {scanning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Analyzing Document Intelligence...
                    </>
                  ) : (
                    <>
                      <ScanLine className="mr-2 h-4 w-4" />
                      Extract Structured Data
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Results Panel */}
          <div className="space-y-4 lg:col-span-7">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-base">Extracted Document Data</CardTitle>
                  <CardDescription>
                    {result ? `${result.documentType?.replace(/_/g, " ").toUpperCase()} · Confidence: ${(result.confidenceScore * 100).toFixed(0)}%` : "Awaiting scan."}
                  </CardDescription>
                </div>
                {result ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={creatingPo}
                      onClick={createPurchaseOrder}
                    >
                      {creatingPo ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                      Create ERP PO
                    </Button>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {!result ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <ScanLine className="h-10 w-10 opacity-30" />
                    <p className="mt-2 text-sm">Upload a document on the left and click Extract.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Header Metadata */}
                    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vendor / Supplier</p>
                        <p className="text-sm font-semibold">{result.vendorName || "Unknown"}</p>
                        {result.matchedSupplierName ? (
                          <Badge variant="secondary" className="mt-1 text-[10px]">
                            ✓ Matched: {result.matchedSupplierName}
                          </Badge>
                        ) : null}
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Document #</p>
                        <p className="font-mono text-sm font-semibold">{result.documentNumber || "N/A"}</p>
                        <p className="text-xs text-muted-foreground">{result.documentDate || "No date"}</p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Amount</p>
                        <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                          ${Number(result.totalAmount || 0).toFixed(2)} {result.currency}
                        </p>
                        <p className="text-[11px] text-muted-foreground">GST: ${Number(result.taxAmount || 0).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Line Items Table */}
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Line Items ({result.items?.length || 0})
                      </p>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-left text-xs">
                          <thead className="border-b bg-muted/50 text-[11px] font-medium text-muted-foreground">
                            <tr>
                              <th className="p-2">Description</th>
                              <th className="p-2">SKU</th>
                              <th className="p-2 text-right">Qty</th>
                              <th className="p-2 text-right">Unit Price</th>
                              <th className="p-2 text-right">Line Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {result.items?.map((item, idx) => (
                              <tr key={idx} className="hover:bg-muted/20">
                                <td className="p-2">
                                  <p className="font-medium">{item.description}</p>
                                  {item.matchedProductName ? (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                      ✓ Matched SKU: {item.matchedProductName}
                                    </span>
                                  ) : null}
                                </td>
                                <td className="p-2 font-mono text-[11px] text-muted-foreground">
                                  {item.sku || "—"}
                                </td>
                                <td className="p-2 text-right font-medium">{item.quantity}</td>
                                <td className="p-2 text-right font-mono">${Number(item.unitPrice || 0).toFixed(2)}</td>
                                <td className="p-2 text-right font-mono font-semibold">${Number(item.lineTotal || 0).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
