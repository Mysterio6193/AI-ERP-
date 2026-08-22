"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { Loader2 } from "lucide-react"

interface QrCodeProps {
  value: string
  size?: number
  className?: string
  alt?: string
}

export function QrCode({ value, size = 200, className = "", alt = "QR Code" }: QrCodeProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function generate() {
      if (!value) {
        setDataUrl(null)
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const url = await QRCode.toDataURL(value, {
          width: size,
          margin: 1,
          color: {
            dark: "#09090b",
            light: "#ffffff",
          },
          errorCorrectionLevel: "M",
        })

        if (active) {
          setDataUrl(url)
        }
      } catch (err) {
        console.error("Failed to generate QR code:", err)
      } finally {
        if (active) setLoading(false)
      }
    }

    void generate()

    return () => {
      active = false
    }
  }, [value, size])

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl bg-white p-4 shadow-sm border border-slate-200 ${className}`}
        style={{ width: size, height: size }}
      >
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!dataUrl) {
    return null
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center overflow-hidden rounded-2xl bg-white p-3 shadow-md border border-slate-200/80 ${className}`}
    >
      <img
        src={dataUrl}
        alt={alt}
        width={size}
        height={size}
        className="rounded-xl"
      />
    </div>
  )
}
