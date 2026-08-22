"use client"

import { PDFDownloadLink } from "@react-pdf/renderer"
import SalesOrderPDF from "@/components/documents/SalesOrderPDF"

interface SalesOrderPdfDownloadLinkProps {
  order: any
  company: any
  fileName: string
  className?: string
  children: (props: { loading: boolean }) => React.ReactNode
}

export default function SalesOrderPdfDownloadLink({
  order,
  company,
  fileName,
  className,
  children,
}: SalesOrderPdfDownloadLinkProps) {
  return (
    <PDFDownloadLink
      document={<SalesOrderPDF order={order} company={company} />}
      fileName={fileName}
      className={className}
    >
      {children}
    </PDFDownloadLink>
  )
}
