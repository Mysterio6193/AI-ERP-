"use client"

import React from "react"
import { pdf } from "@react-pdf/renderer"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function buildPdfUrl(document: React.ReactElement<any>) {
  const blob = await pdf(document as any).toBlob()
  return URL.createObjectURL(blob)
}

export async function downloadPdfDocument(document: React.ReactElement<any>, fileName: string) {
  const objectUrl = await buildPdfUrl(document)

  const link = window.document.createElement("a")
  link.href = objectUrl
  link.download = fileName
  window.document.body.appendChild(link)
  link.click()
  window.document.body.removeChild(link)

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export async function printPdfDocument(document: React.ReactElement<any>, title: string) {
  const objectUrl = await buildPdfUrl(document)
  const printFrame = window.document.createElement("iframe")
  printFrame.style.position = "fixed"
  printFrame.style.right = "0"
  printFrame.style.bottom = "0"
  printFrame.style.width = "0"
  printFrame.style.height = "0"
  printFrame.style.border = "0"
  printFrame.src = objectUrl
  printFrame.title = title

  const cleanup = () => {
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl)
      printFrame.remove()
    }, 1500)
  }

  window.document.body.appendChild(printFrame)

  await new Promise<void>((resolve) => {
    printFrame.onload = () => resolve()
  })

  await sleep(150)

  const printWindow = printFrame.contentWindow
  if (printWindow) {
    printWindow.focus()
    printWindow.print()
  }

  cleanup()
}

export async function downloadPdfBatch(
  entries: Array<{ document: React.ReactElement<any>; fileName: string }>
) {
  for (const entry of entries) {
    await downloadPdfDocument(entry.document, entry.fileName)
    await sleep(200)
  }
}

export async function printPdfBatch(
  entries: Array<{ document: React.ReactElement<any>; title: string }>
) {
  for (const entry of entries) {
    await printPdfDocument(entry.document, entry.title)
    await sleep(250)
  }
}
