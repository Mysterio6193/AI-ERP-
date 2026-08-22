"use client"

import { useRef, useState } from "react"
import { Camera, Image as ImageIcon, Loader2, Trash2 } from "lucide-react"

interface PhotoCaptureProps {
  value?: string | null
  onChange: (url: string) => void
  label?: string
  purpose?: string
  disabled?: boolean
}

export function PhotoCapture({
  value,
  onChange,
  label = "Take Photo / Proof",
  purpose = "pod_photo",
  disabled,
}: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      setUploading(true)
      setError(null)

      const formData = new FormData()
      formData.append("file", file)
      formData.append("purpose", purpose)

      const res = await fetch("/api/core/driver/uploads", {
        method: "POST",
        body: formData,
      })

      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to upload photo")
      }

      onChange(data.data.url)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  function handleRemove() {
    onChange("")
    setError(null)
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        style={{ display: "none" }}
        disabled={disabled || uploading}
      />

      {value ? (
        <div
          style={{
            position: "relative",
            width: "100%",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            background: "rgba(15, 23, 42, 0.6)",
          }}
        >
          <img
            src={value}
            alt="Proof"
            style={{
              width: "100%",
              maxHeight: "220px",
              objectFit: "cover",
              display: "block",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: "8px",
              right: "8px",
              display: "flex",
              gap: "6px",
            }}
          >
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              style={{
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                color: "#f87171",
                padding: "6px 10px",
                borderRadius: "8px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "12px",
                backdropFilter: "blur(8px)",
              }}
            >
              <Trash2 size={14} />
              <span>Remove</span>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "24px 16px",
            background: "rgba(15, 23, 42, 0.6)",
            border: "1.5px dashed rgba(148, 163, 184, 0.3)",
            borderRadius: "12px",
            color: "#94a3b8",
            cursor: disabled || uploading ? "not-allowed" : "pointer",
            width: "100%",
            transition: "border-color 0.2s, background 0.2s",
          }}
        >
          {uploading ? (
            <>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "#38bdf8" }} />
              <span style={{ fontSize: "13px", color: "#cbd5e1" }}>Uploading photo...</span>
            </>
          ) : (
            <>
              <div
                style={{
                  width: "44px",
                  height: "44px",
                  borderRadius: "50%",
                  background: "rgba(56, 189, 248, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#38bdf8",
                }}
              >
                <Camera size={22} />
              </div>
              <span style={{ fontSize: "14px", fontWeight: 500, color: "#e2e8f0" }}>{label}</span>
              <span style={{ fontSize: "12px", color: "#64748b" }}>Tap to snap or upload from gallery</span>
            </>
          )}
        </button>
      )}

      {error && (
        <p style={{ margin: 0, fontSize: "12px", color: "#f87171" }}>{error}</p>
      )}
    </div>
  )
}
