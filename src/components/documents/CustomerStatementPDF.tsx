"use client"

import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { differenceInCalendarDays, format } from "date-fns"

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
  title: {
    fontSize: 24,
    fontWeight: "bold",
    textAlign: "right",
    marginBottom: 8,
  },
  metaCard: {
    width: "38%",
    borderWidth: 1,
    borderColor: "#d2d2d7",
    borderRadius: 8,
    padding: 10,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  metaLabel: {
    color: "#6e6e73",
  },
  sectionGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 18,
  },
  card: {
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
  value: {
    marginBottom: 2,
  },
  emphasis: {
    fontWeight: "bold",
    fontSize: 11,
  },
  table: {
    marginBottom: 14,
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
  colInvoice: { width: "22%" },
  colDate: { width: "16%" },
  colDue: { width: "16%" },
  colStatus: { width: "18%" },
  colAmount: { width: "14%", textAlign: "right" },
  colOutstanding: { width: "14%", textAlign: "right" },
  txDate: { width: "16%" },
  txDesc: { width: "42%" },
  txRef: { width: "16%" },
  txAmount: { width: "12%", textAlign: "right" },
  txBalance: { width: "14%", textAlign: "right" },
  agingGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  agingCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5ea",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fafafa",
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

function computeAgingBuckets(invoices: any[], statementEnd: string | Date, currency: string) {
  const buckets = [
    { label: "Current", min: Number.NEGATIVE_INFINITY, max: 0, amount: 0 },
    { label: "1-30", min: 1, max: 30, amount: 0 },
    { label: "31-60", min: 31, max: 60, amount: 0 },
    { label: "61+", min: 61, max: Number.POSITIVE_INFINITY, amount: 0 },
  ]
  const end = new Date(statementEnd)

  for (const invoice of invoices || []) {
    const daysLate = differenceInCalendarDays(end, new Date(invoice.dueDate))
    const bucket = buckets.find((item) => daysLate >= item.min && daysLate <= item.max)
    if (bucket) {
      bucket.amount += Number(invoice.outstandingAmount || 0)
    }
  }

  return buckets.map((bucket) => ({
    ...bucket,
    displayAmount: formatCurrency(bucket.amount, currency),
  }))
}

interface CustomerStatementPDFProps {
  statement: any
  company: any
}

const CustomerStatementPDF = ({ statement, company }: CustomerStatementPDFProps) => {
  const branding = sanitizeCompanyBranding(company)
  const brandName = getCompanyDisplayName(branding)
  const companyAddressLine = getCompanyAddressLine(branding)
  const companyEmail = getCompanyEmail(branding)
  const companyWebsite = getCompanyWebsite(branding)
  const currency = branding?.baseCurrency || "AUD"
  const aging = computeAgingBuckets(statement.invoices || [], statement.summary.statementEnd, currency)
  const recentTransactions = (statement.transactions || []).slice(0, 12)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{brandName}</Text>
            {branding?.address ? <Text>{branding.address}</Text> : null}
            {companyAddressLine ? <Text>{companyAddressLine}</Text> : null}
            <Text style={styles.value}>
              Phone: {branding?.phone || "-"}{companyEmail ? `  |  Email: ${companyEmail}` : ""}
            </Text>
            {companyWebsite ? <Text style={styles.value}>Website: {companyWebsite}</Text> : null}
          </View>

          <View style={styles.metaCard}>
            <Text style={styles.title}>Statement</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Statement #</Text>
              <Text>{statement.summary.statementNumber}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>From</Text>
              <Text>{formatDate(statement.summary.statementStart)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>To</Text>
              <Text>{formatDate(statement.summary.statementEnd)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Terms</Text>
              <Text>Net {statement.customer.paymentTerms}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sectionGrid}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Statement For</Text>
            <Text style={styles.emphasis}>{statement.customer.name}</Text>
            {statement.customer.email ? <Text style={styles.value}>{statement.customer.email}</Text> : null}
            {statement.customer.phone ? <Text style={styles.value}>{statement.customer.phone}</Text> : null}
            <Text style={styles.value}>Credit status: {String(statement.customer.creditStatus || "").replace(/_/g, " ")}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Account Summary</Text>
            <View style={styles.metaRow}>
              <Text>Outstanding</Text>
              <Text>{formatCurrency(statement.summary.outstandingBalance, currency)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text>Overdue</Text>
              <Text>{formatCurrency(statement.summary.overdueAmount, currency)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text>Minimum Due</Text>
              <Text>{formatCurrency(statement.summary.minimumPaymentDue, currency)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text>Credit Limit</Text>
              <Text>{formatCurrency(statement.summary.creditLimit, currency)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.agingGrid}>
          {aging.map((bucket) => (
            <View key={bucket.label} style={styles.agingCard}>
              <Text style={styles.sectionTitle}>{bucket.label}</Text>
              <Text style={styles.emphasis}>{bucket.displayAmount}</Text>
            </View>
          ))}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colInvoice}>Invoice</Text>
            <Text style={styles.colDate}>Invoice Date</Text>
            <Text style={styles.colDue}>Due Date</Text>
            <Text style={styles.colStatus}>Status</Text>
            <Text style={styles.colAmount}>Total</Text>
            <Text style={styles.colOutstanding}>Outstanding</Text>
          </View>
          {(statement.invoices || []).slice(0, 10).map((invoice: any) => (
            <View key={invoice.id} style={styles.tableRow}>
              <Text style={styles.colInvoice}>{invoice.invoiceNumber}</Text>
              <Text style={styles.colDate}>{formatDate(invoice.invoiceDate)}</Text>
              <Text style={styles.colDue}>{formatDate(invoice.dueDate)}</Text>
              <Text style={styles.colStatus}>{invoice.status}</Text>
              <Text style={styles.colAmount}>{formatCurrency(invoice.totalAmount, currency)}</Text>
              <Text style={styles.colOutstanding}>{formatCurrency(invoice.outstandingAmount, currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.txDate}>Date</Text>
            <Text style={styles.txDesc}>Activity</Text>
            <Text style={styles.txRef}>Reference</Text>
            <Text style={styles.txAmount}>Amount</Text>
            <Text style={styles.txBalance}>Balance</Text>
          </View>
          {recentTransactions.map((transaction: any) => (
            <View key={transaction.id} style={styles.tableRow}>
              <Text style={styles.txDate}>{formatDate(transaction.date)}</Text>
              <Text style={styles.txDesc}>{transaction.description}</Text>
              <Text style={styles.txRef}>{transaction.reference || "-"}</Text>
              <Text style={styles.txAmount}>{formatCurrency(transaction.amount, currency)}</Text>
              <Text style={styles.txBalance}>{formatCurrency(transaction.balanceAfter, currency)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>
            Please settle overdue invoices and quote the statement number on your remittance advice.
          </Text>
          <Text>
            {brandName}{companyWebsite ? ` | ${companyWebsite}` : ""}{companyEmail ? ` | ${companyEmail}` : ""}
          </Text>
        </View>
      </Page>
    </Document>
  )
}

export default CustomerStatementPDF
