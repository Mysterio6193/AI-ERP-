"use client"

import React from "react"
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { format } from "date-fns"

const styles = StyleSheet.create({
  page: {
    padding: 32,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1e293b",
    lineHeight: 1.4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
    borderBottomWidth: 1.5,
    borderBottomColor: "#0f172a",
    paddingBottom: 14,
  },
  companyBlock: {
    width: "55%",
  },
  companyName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0f172a",
    marginBottom: 2,
  },
  companySub: {
    fontSize: 8.5,
    color: "#64748b",
  },
  reportMetaBlock: {
    width: "42%",
    alignItems: "flex-end",
  },
  reportTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0f172a",
    textAlign: "right",
    marginBottom: 4,
  },
  reportSubtitle: {
    fontSize: 9,
    color: "#64748b",
    textAlign: "right",
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 6,
    padding: 8,
  },
  summaryLabel: {
    fontSize: 7.5,
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0f172a",
  },
  table: {
    width: "100%",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 4,
    overflow: "hidden",
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderCell: {
    color: "#ffffff",
    fontSize: 8,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: "#f8fafc",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  tableCell: {
    fontSize: 8,
    color: "#334155",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 32,
    right: 32,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
    fontSize: 7.5,
    color: "#94a3b8",
  },
})

export interface SummaryCardData {
  label: string
  value: string | number
}

export interface CustomReportPDFProps {
  title: string
  subtitle?: string
  headers: string[]
  rows: Array<Array<string | number | boolean | null>>
  summaryCards?: SummaryCardData[]
  companyName?: string
}

export default function CustomReportPDF({
  title,
  subtitle,
  headers,
  rows,
  summaryCards,
  companyName = "SupplySure OS Wholesale Distribution",
}: CustomReportPDFProps) {
  const dateStr = format(new Date(), "dd MMM yyyy, HH:mm")

  // Calculate proportional column widths
  const colWidthPercent = headers.length > 0 ? `${(100 / headers.length).toFixed(1)}%` : "100%"

  return (
    <Document title={title} author={companyName}>
      <Page size="A4" orientation={headers.length > 5 ? "landscape" : "portrait"} style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{companyName}</Text>
            <Text style={styles.companySub}>Enterprise Operations & Supply Chain Report</Text>
          </View>
          <View style={styles.reportMetaBlock}>
            <Text style={styles.reportTitle}>{title}</Text>
            <Text style={styles.reportSubtitle}>{subtitle || `Generated: ${dateStr}`}</Text>
          </View>
        </View>

        {/* Summary Badges / Cards */}
        {summaryCards && summaryCards.length > 0 && (
          <View style={styles.summaryGrid}>
            {summaryCards.map((card, idx) => (
              <View key={idx} style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{card.label}</Text>
                <Text style={styles.summaryValue}>{String(card.value)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Table */}
        <View style={styles.table}>
          {/* Header Row */}
          <View style={styles.tableHeader}>
            {headers.map((h, idx) => (
              <Text key={idx} style={[styles.tableHeaderCell, { width: colWidthPercent }]}>
                {h}
              </Text>
            ))}
          </View>

          {/* Data Rows */}
          {rows.map((row, rowIdx) => (
            <View key={rowIdx} style={rowIdx % 2 === 1 ? styles.tableRowAlt : styles.tableRow}>
              {row.map((cell, colIdx) => (
                <Text key={colIdx} style={[styles.tableCell, { width: colWidthPercent }]}>
                  {cell === null || cell === undefined ? "" : String(cell)}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>{companyName} • Confidential Business Report</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
