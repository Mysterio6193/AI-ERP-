"use client"

import { PDFDownloadLink } from "@react-pdf/renderer"
import InvoicePDF from "@/components/documents/InvoicePDF"

interface InvoicePdfDownloadLinkProps {
  invoice: any
  company: any
  fileName: string
  className?: string
  children: (props: { loading: boolean }) => React.ReactNode
}

export default function InvoicePdfDownloadLink({
  invoice,
  company,
  fileName,
  className,
  children,
}: InvoicePdfDownloadLinkProps) {
  return (
    <PDFDownloadLink
      document={<InvoicePDF invoice={invoice} company={company} />}
      fileName={fileName}
      className={className}
    >
      {children}
    </PDFDownloadLink>
  )
}
