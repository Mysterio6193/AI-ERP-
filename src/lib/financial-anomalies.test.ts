import { describe, expect, it } from "vitest"

import {
  detectDuplicatePayments,
  detectInvoiceAnomalies,
  detectPricingDrift,
  detectReconciliationAnomalies,
  type RawInvoiceData,
  type RawPaymentData,
  type RawLinePriceData,
  type RawReconciliationItem,
} from "./financial-anomalies"

describe("detectInvoiceAnomalies", () => {
  it("detects suspect duplicate invoices issued for the same customer within 72h", () => {
    const invoices: RawInvoiceData[] = [
      {
        id: "inv-1",
        invoiceNumber: "INV-1001",
        customerId: "cust-1",
        customerName: "Mario's Pizzeria",
        invoiceDate: "2026-03-01T10:00:00Z",
        dueDate: "2026-03-31T00:00:00Z",
        subtotal: 500,
        taxAmount: 50,
        totalAmount: 550,
        paidAmount: 0,
        outstandingAmt: 550,
        status: "unpaid",
      },
      {
        id: "inv-2",
        invoiceNumber: "INV-1002",
        customerId: "cust-1",
        customerName: "Mario's Pizzeria",
        invoiceDate: "2026-03-02T11:00:00Z", // 25 hours later, identical amount
        dueDate: "2026-04-01T00:00:00Z",
        subtotal: 500,
        taxAmount: 50,
        totalAmount: 550,
        paidAmount: 0,
        outstandingAmt: 550,
        status: "unpaid",
      },
    ]

    const anomalies = detectInvoiceAnomalies(invoices)
    expect(anomalies.some((a) => a.type === "DUPLICATE_SUSPECT")).toBe(true)
    expect(anomalies[0].severity).toBe("HIGH")
  })

  it("flags invoices with invalid due date before invoice date", () => {
    const invoices: RawInvoiceData[] = [
      {
        id: "inv-3",
        invoiceNumber: "INV-1003",
        customerId: "cust-2",
        customerName: "Luigi's Trattoria",
        invoiceDate: "2026-03-15T00:00:00Z",
        dueDate: "2026-03-10T00:00:00Z", // Due date before invoice date!
        subtotal: 200,
        taxAmount: 20,
        totalAmount: 220,
        paidAmount: 0,
        outstandingAmt: 220,
        status: "unpaid",
      },
    ]

    const anomalies = detectInvoiceAnomalies(invoices)
    expect(anomalies.some((a) => a.type === "INVALID_DATES")).toBe(true)
  })

  it("flags overpaid invoices where paid amount exceeds total", () => {
    const invoices: RawInvoiceData[] = [
      {
        id: "inv-4",
        invoiceNumber: "INV-1004",
        customerId: "cust-3",
        customerName: "Bella Italia",
        invoiceDate: "2026-03-01T00:00:00Z",
        dueDate: "2026-03-31T00:00:00Z",
        subtotal: 300,
        taxAmount: 30,
        totalAmount: 330,
        paidAmount: 400, // Overpaid by $70
        outstandingAmt: 0,
        status: "paid",
      },
    ]

    const anomalies = detectInvoiceAnomalies(invoices)
    expect(anomalies.some((a) => a.type === "OVERPAID")).toBe(true)
    expect(anomalies.find((a) => a.type === "OVERPAID")?.severity).toBe("HIGH")
  })

  it("flags statistical outliers exceeding 3 standard deviations from customer mean", () => {
    const invoices: RawInvoiceData[] = [
      {
        id: "inv-5",
        invoiceNumber: "INV-1005",
        customerId: "cust-4",
        customerName: "Napoli Cafe",
        invoiceDate: "2026-03-01T00:00:00Z",
        dueDate: "2026-03-31T00:00:00Z",
        subtotal: 10000,
        taxAmount: 1000,
        totalAmount: 11000, // Regular average is $500 +/- $100
        paidAmount: 0,
        outstandingAmt: 11000,
        status: "unpaid",
      },
    ]

    const historicalMap = new Map([["cust-4", { mean: 500, stdDev: 100 }]])
    const anomalies = detectInvoiceAnomalies(invoices, historicalMap)

    expect(anomalies.some((a) => a.type === "STATISTICAL_OUTLIER")).toBe(true)
  })
})

describe("detectDuplicatePayments", () => {
  it("detects exact duplicate payments with same reference and amount within 24h", () => {
    const payments: RawPaymentData[] = [
      {
        id: "pay-1",
        invoiceId: "inv-1",
        customerId: "cust-1",
        customerName: "Mario's Pizzeria",
        amount: 350.0,
        method: "bank_transfer",
        reference: "TX-998811",
        paidAt: "2026-03-05T09:00:00Z",
      },
      {
        id: "pay-2",
        invoiceId: "inv-1",
        customerId: "cust-1",
        customerName: "Mario's Pizzeria",
        amount: 350.0,
        method: "bank_transfer",
        reference: "TX-998811", // Duplicate ref & amount
        paidAt: "2026-03-05T09:05:00Z",
      },
    ]

    const duplicates = detectDuplicatePayments(payments)
    expect(duplicates.length).toBe(1)
    expect(duplicates[0].type).toBe("EXACT_DUPLICATE_PAYMENT")
    expect(duplicates[0].severity).toBe("HIGH")
    expect(duplicates[0].payments.length).toBe(2)
  })
})

describe("detectPricingDrift", () => {
  it("identifies undercharged and overcharged line items relative to contract price", () => {
    const lines: RawLinePriceData[] = [
      {
        lineId: "line-1",
        orderId: "ord-1",
        orderNumber: "SO-1001",
        customerId: "cust-1",
        customerName: "Mario's Pizzeria",
        productId: "prod-1",
        productName: "12 inch Pizza Base",
        sku: "PB-12",
        quantity: 100,
        invoicedUnitPrice: 3.5, // Contract price is $4.50 -> Undercharged by $1.00/unit ($100 total, 22.2%)
        expectedContractPrice: 4.5,
        priceSource: "priceList",
        orderDate: "2026-03-01",
      },
      {
        lineId: "line-2",
        orderId: "ord-2",
        orderNumber: "SO-1002",
        customerId: "cust-2",
        customerName: "Luigi's Trattoria",
        productId: "prod-2",
        productName: "Dough Ball 250g",
        sku: "DB-250",
        quantity: 50,
        invoicedUnitPrice: 2.0,
        expectedContractPrice: 2.01, // Only 0.5% variance -> Should NOT flag
        priceSource: "priceList",
        orderDate: "2026-03-01",
      },
    ]

    const drift = detectPricingDrift(lines, 5.0)
    expect(drift.length).toBe(1)
    expect(drift[0].driftType).toBe("UNDERCHARGED")
    expect(drift[0].varianceTotal).toBe(-100)
    expect(drift[0].variancePercent).toBeGreaterThan(20)
  })
})

describe("detectReconciliationAnomalies", () => {
  const refDate = new Date("2026-03-25T00:00:00Z")

  it("flags aged unmatched bank transactions over 14 days old", () => {
    const items: RawReconciliationItem[] = [
      {
        id: "btx-1",
        type: "BANK_TX",
        reference: "EFT Deposit",
        amount: 1250.0,
        date: "2026-03-01T00:00:00Z", // 24 days old
        status: "unmatched",
        description: "Direct Deposit ABC Pty Ltd",
      },
      {
        id: "btx-2",
        type: "BANK_TX",
        reference: "EFT Deposit",
        amount: 200.0,
        date: "2026-03-23T00:00:00Z", // 2 days old -> not aged
        status: "unmatched",
        description: "Recent deposit",
      },
    ]

    const anomalies = detectReconciliationAnomalies(items, refDate)
    expect(anomalies.some((a) => a.type === "UNMATCHED_AGED_TX")).toBe(true)
    expect(anomalies.length).toBe(1)
  })

  it("flags active credit notes unapplied for over 45 days", () => {
    const items: RawReconciliationItem[] = [
      {
        id: "cn-1",
        type: "CREDIT_NOTE",
        reference: "CN-1001",
        amount: 150.0,
        date: "2026-01-10T00:00:00Z", // ~74 days old
        status: "active",
        description: "Return damaged box",
      },
    ]

    const anomalies = detectReconciliationAnomalies(items, refDate)
    expect(anomalies.some((a) => a.type === "UNAPPLIED_CREDIT_NOTE")).toBe(true)
  })
})
