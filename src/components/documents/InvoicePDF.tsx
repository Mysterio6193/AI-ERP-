"use client"

import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { format } from "date-fns"

import {
  getCompanyAddressLine,
  getCompanyDisplayName,
  getCompanyEmail,
  getCompanyWebsite,
  sanitizeCompanyBranding,
} from "@/lib/company-branding"

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: "#1d1d1f",
    lineHeight: 1.45,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  companyBlock: {
    width: "56%",
  },
  companyName: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 4,
  },
  documentTitle: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "right",
    marginBottom: 8,
  },
  subtle: {
    color: "#6e6e73",
  },
  metaBlock: {
    width: "38%",
    alignItems: "stretch",
  },
  metaCard: {
    borderWidth: 1,
    borderColor: "#d2d2d7",
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  metaLabel: {
    color: "#6e6e73",
  },
  statusPill: {
    alignSelf: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    fontSize: 8.5,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  sectionGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  sectionCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5ea",
    borderRadius: 10,
    padding: 12,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "bold",
    textTransform: "uppercase",
    marginBottom: 8,
    color: "#6e6e73",
  },
  sectionValue: {
    marginBottom: 2,
  },
  sectionEmphasis: {
    fontWeight: "bold",
    fontSize: 11,
  },
  table: {
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e5e5ea",
    borderRadius: 10,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f5f5f7",
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 8.5,
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "#6e6e73",
  },
  tableRow: {
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f3",
  },
  colDescription: { width: "40%" },
  colQty: { width: "10%", textAlign: "center" },
  colRate: { width: "14%", textAlign: "right" },
  colDiscount: { width: "10%", textAlign: "right" },
  colTax: { width: "12%", textAlign: "right" },
  colTotal: { width: "14%", textAlign: "right" },
  lineTitle: {
    fontWeight: "bold",
    marginBottom: 2,
  },
  lineMeta: {
    fontSize: 8.5,
    color: "#6e6e73",
  },
  bottomGrid: {
    flexDirection: "row",
    gap: 12,
  },
  notesCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5ea",
    borderRadius: 10,
    padding: 12,
  },
  totalsCard: {
    width: "34%",
    borderWidth: 1,
    borderColor: "#d2d2d7",
    borderRadius: 10,
    padding: 12,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalStrong: {
    fontWeight: "bold",
  },
  totalGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d2d2d7",
    fontSize: 12,
    fontWeight: "bold",
  },
  paymentsCard: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#e5e5ea",
    borderRadius: 10,
    padding: 12,
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: 28,
    right: 28,
    borderTopWidth: 1,
    borderTopColor: "#e5e5ea",
    paddingTop: 8,
    fontSize: 8,
    color: "#6e6e73",
    textAlign: "center",
  },
})

function formatCurrency(amount: number | null | undefined, currency?: string | null) {
  const symbol = currency === "INR" ? "Rs" : "$"
  return `${symbol} ${Number(amount || 0).toFixed(2)}`
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-"
  return format(new Date(value), "dd MMM yyyy")
}

function compactAddress(location?: {
  address?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
} | null) {
  if (!location) return null
  const lines = [location.address, location.address2].filter(Boolean)
  const locality = [location.city, location.state, location.postcode].filter(Boolean).join(", ")
  if (locality) lines.push(locality)
  return lines
}

function getStatusStyle(status?: string) {
  const normalized = String(status || "").toLowerCase()
  if (normalized === "paid") return { backgroundColor: "#e8fff3", color: "#127c46" }
  if (normalized === "partial" || normalized === "sent") return { backgroundColor: "#fff7e6", color: "#9a6700" }
  if (normalized === "overdue" || normalized === "cancelled") return { backgroundColor: "#fff1f0", color: "#b42318" }
  return { backgroundColor: "#eef4ff", color: "#175cd3" }
}

interface InvoicePDFProps {
  invoice: any
  company: any
}

const InvoicePDF = ({ invoice, company }: InvoicePDFProps) => {
  const order = invoice.order || {}
  const customer = invoice.customer || {}
  const branding = sanitizeCompanyBranding(company)
  const brandName = getCompanyDisplayName(branding)
  const companyAddressLine = getCompanyAddressLine(branding)
  const companyEmail = getCompanyEmail(branding)
  const companyWebsite = getCompanyWebsite(branding)
  const shippingLocation =
    customer.locations?.find((location: any) => location.id === order.locationId) ||
    customer.locations?.find((location: any) => location.isShipping) ||
    customer.locations?.[0] ||
    null
  const billingLocation =
    customer.locations?.find((location: any) => location.isBilling) ||
    customer.locations?.[0] ||
    null
  const paymentTerms = customer.paymentTerms ? `Net ${customer.paymentTerms}` : "Due on receipt"
  const companyCurrency = branding?.baseCurrency || "AUD"
  const documentNotes = [invoice.notes, order.customerNotes, order.internalNotes].filter(Boolean)
  const paymentRows = Array.isArray(invoice.payments) ? invoice.payments.slice(0, 4) : []

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{brandName}</Text>
            {branding?.address ? <Text>{branding.address}</Text> : null}
            {companyAddressLine ? <Text>{companyAddressLine}</Text> : null}
            <Text style={styles.sectionValue}>
              Phone: {branding?.phone || "-"}{companyEmail ? `  |  Email: ${companyEmail}` : ""}
            </Text>
            {companyWebsite ? <Text style={styles.sectionValue}>Website: {companyWebsite}</Text> : null}
            {branding?.abn ? <Text style={styles.sectionValue}>ABN: {branding.abn}</Text> : null}
            {branding?.gstin ? <Text style={styles.sectionValue}>GSTIN: {branding.gstin}</Text> : null}
          </View>

          <View style={styles.metaBlock}>
            <Text style={styles.documentTitle}>Tax Invoice</Text>
            <View style={[styles.statusPill, getStatusStyle(invoice.status)]}>
              <Text>{String(invoice.status || "unpaid").toUpperCase()}</Text>
            </View>
            <View style={styles.metaCard}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Invoice #</Text>
                <Text>{invoice.invoiceNumber}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Sales Order</Text>
                <Text>{order.orderNumber || "-"}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Invoice Date</Text>
                <Text>{formatDate(invoice.invoiceDate)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Due Date</Text>
                <Text>{formatDate(invoice.dueDate)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Terms</Text>
                <Text>{paymentTerms}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Channel</Text>
                <Text>{String(order.sourceChannel || "admin").replace(/_/g, " ")}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.sectionGrid}>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Bill To</Text>
            <Text style={styles.sectionEmphasis}>{customer.name || "-"}</Text>
            {customer.tradingName ? <Text style={styles.sectionValue}>{customer.tradingName}</Text> : null}
            {customer.email ? <Text style={styles.sectionValue}>{customer.email}</Text> : null}
            {customer.phone ? <Text style={styles.sectionValue}>{customer.phone}</Text> : null}
            {compactAddress(billingLocation)?.map((line) => (
              <Text key={line} style={styles.sectionValue}>{line}</Text>
            ))}
            {customer.abn ? <Text style={styles.sectionValue}>ABN: {customer.abn}</Text> : null}
          </View>
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Ship To</Text>
            {compactAddress(shippingLocation)?.length ? (
              compactAddress(shippingLocation)?.map((line) => (
                <Text key={line} style={styles.sectionValue}>{line}</Text>
              ))
            ) : (
              <Text style={styles.sectionValue}>No shipping address recorded on this order.</Text>
            )}
            {order.requiredDate ? (
              <Text style={styles.sectionValue}>Requested delivery: {formatDate(order.requiredDate)}</Text>
            ) : null}
            {order.deliveryDate ? (
              <Text style={styles.sectionValue}>Delivered: {formatDate(order.deliveryDate)}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDescription}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colDiscount}>Disc.</Text>
            <Text style={styles.colTax}>GST</Text>
            <Text style={styles.colTotal}>Line Total</Text>
          </View>
          {(order.items || []).map((item: any, index: number) => (
            <View key={item.id || index} style={styles.tableRow}>
              <View style={styles.colDescription}>
                <Text style={styles.lineTitle}>{item.product?.name || "Product"}</Text>
                <Text style={styles.lineMeta}>
                  SKU: {item.product?.sku || "-"}{item.product?.baseUnit ? `  |  Unit: ${item.product.baseUnit}` : ""}
                </Text>
              </View>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colRate}>{formatCurrency(item.unitPrice, companyCurrency)}</Text>
              <Text style={styles.colDiscount}>{Number(item.discount || 0).toFixed(1)}%</Text>
              <Text style={styles.colTax}>{formatCurrency(item.taxAmount, companyCurrency)}</Text>
              <Text style={styles.colTotal}>{formatCurrency(item.total, companyCurrency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomGrid}>
          <View style={styles.notesCard}>
            <Text style={styles.sectionTitle}>Notes & Remittance</Text>
            {documentNotes.length > 0 ? documentNotes.map((note: string, index: number) => (
              <Text key={`${note}-${index}`} style={styles.sectionValue}>{note}</Text>
            )) : (
              <Text style={styles.sectionValue}>No customer or internal notes were attached to this invoice.</Text>
            )}
            <Text style={[styles.sectionValue, { marginTop: 8 }]}>
              Please quote invoice number {invoice.invoiceNumber} with your remittance advice.
            </Text>
            {branding?.bankName ? <Text style={styles.sectionValue}>Bank: {branding.bankName}</Text> : null}
            {branding?.bsb ? <Text style={styles.sectionValue}>BSB: {branding.bsb}</Text> : null}
            {branding?.accountNumber ? <Text style={styles.sectionValue}>Account: {branding.accountNumber}</Text> : null}
            {branding?.accountName ? <Text style={styles.sectionValue}>Account name: {branding.accountName}</Text> : null}
            {branding?.upiId ? <Text style={styles.sectionValue}>UPI: {branding.upiId}</Text> : null}
            {branding?.ifscCode ? <Text style={styles.sectionValue}>IFSC: {branding.ifscCode}</Text> : null}
          </View>

          <View style={styles.totalsCard}>
            <Text style={styles.sectionTitle}>Invoice Summary</Text>
            <View style={styles.totalRow}>
              <Text>Subtotal</Text>
              <Text>{formatCurrency(invoice.subtotal, companyCurrency)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>Discount</Text>
              <Text>{formatCurrency(order.discountAmount || invoice.discountAmount || 0, companyCurrency)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>GST</Text>
              <Text>{formatCurrency(invoice.taxAmount, companyCurrency)}</Text>
            </View>
            <View style={styles.totalGrand}>
              <Text>Total</Text>
              <Text>{formatCurrency(invoice.totalAmount, companyCurrency)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text>Paid</Text>
              <Text>{formatCurrency(invoice.paidAmount, companyCurrency)}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalStrong]}>
              <Text>Balance Due</Text>
              <Text>{formatCurrency(invoice.outstandingAmt, companyCurrency)}</Text>
            </View>
          </View>
        </View>

        {paymentRows.length > 0 ? (
          <View style={styles.paymentsCard}>
            <Text style={styles.sectionTitle}>Recent Payments</Text>
            {paymentRows.map((payment: any) => (
              <View key={payment.id} style={styles.metaRow}>
                <Text>{formatDate(payment.paidAt)} · {payment.method || "payment"}{payment.reference ? ` · ${payment.reference}` : ""}</Text>
                <Text>{formatCurrency(payment.amount, companyCurrency)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <Text>
            {branding?.invoiceFooter || "Thank you for your business."}
          </Text>
          <Text>
            {brandName}{companyWebsite ? ` | ${companyWebsite}` : ""}{companyEmail ? ` | ${companyEmail}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export default InvoicePDF
