"use client"

import { PDFDownloadLink } from "@react-pdf/renderer"

import CustomerStatementPDF from "@/components/documents/CustomerStatementPDF"

interface CustomerStatementPdfDownloadLinkProps {
  statement: any
  company: any
  fileName: string
  className?: string
  children: (props: { loading: boolean }) => React.ReactNode
}

export default function CustomerStatementPdfDownloadLink({
  statement,
  company,
  fileName,
  className,
  children,
}: CustomerStatementPdfDownloadLinkProps) {
  return (
    <PDFDownloadLink
      document={<CustomerStatementPDF statement={statement} company={company} />}
      fileName={fileName}
      className={className}
    >
      {children}
    </PDFDownloadLink>
  )
}
