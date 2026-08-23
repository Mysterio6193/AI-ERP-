"use client"

import { useRef, useState } from "react"
import { Camera, Image as ImageIcon, Loader2, Trash2, Upload } from "lucide-react"
import { audioFeedback } from "./AudioFeedback"
import styles from "../../page.module.css"

interface PhotoCaptureProps {
  value?: string | null
  onChange: (url: string) => void
  label?: string
  purpose?: string
}

export function PhotoCapture({
  value,
  onChange,
  label = "Capture Photo",
  purpose = "general_proof",
}: PhotoCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
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
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Failed to upload photo")
      }

      audioFeedback.playSuccessChime()
      onChange(data.data.url)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Upload error")
      audioFeedback.playErrorBuzz()
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  function handleRemove() {
    onChange("")
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelected}
        style={{ display: "none" }}
      />

      {error && (
        <div style={{ color: "#b91c1c", fontSize: "13px", background: "#fef2f2", padding: "6px 10px", borderRadius: "8px" }}>
          {error}
        </div>
      )}

      {value ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
          {/* Apple Signature Product Drop-Shadow */}
          <div className={styles.productImageContainer}>
            <img
              src={value}
              alt="Proof Preview"
              className={styles.productImageShadow}
              style={{ maxHeight: "200px", maxWidth: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className={styles.buttonPearlCapsule}
              style={{ fontSize: "13px" }}
            >
              <Camera size={14} />
              <span>Retake Photo</span>
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className={styles.buttonPearlCapsule}
              style={{ fontSize: "13px", color: "#b91c1c" }}
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
          disabled={uploading}
          className={styles.buttonSecondaryPill}
          style={{ width: "100%", padding: "14px", borderStyle: "dashed" }}
        >
          {uploading ? (
            <>
              <Loader2 size={18} className={styles.spin} />
              <span>Uploading Photo...</span>
            </>
          ) : (
            <>
              <Camera size={18} />
              <span>{label}</span>
            </>
          )}
        </button>
      )}
    </div>
  )
}
