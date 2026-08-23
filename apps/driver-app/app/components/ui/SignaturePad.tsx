"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Edit3, Eraser } from "lucide-react"
import styles from "../../page.module.css"

interface SignaturePadProps {
  initialValue?: string | null
  onSave: (dataUrl: string) => void
  onClear?: () => void
}

export function SignaturePad({ initialValue, onSave, onClear }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(Boolean(initialValue))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // High-DPI Canvas scaling
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    ctx.strokeStyle = "#1d1d1f"
    ctx.lineWidth = 2.5
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    if (initialValue) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height)
      }
      img.src = initialValue
    }
  }, [initialValue])

  function getCoordinates(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    if ("touches" in e) {
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    }

    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
    setHasDrawn(true)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { x, y } = getCoordinates(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function stopDrawing() {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL("image/png")
    onSave(dataUrl)
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
    onClear?.()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "150px",
          background: "#ffffff",
          border: "1px solid var(--hairline)",
          borderRadius: "11px",
          overflow: "hidden",
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            cursor: "crosshair",
          }}
        />

        {!hasDrawn && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              color: "var(--ink-muted-48)",
              fontSize: "14px",
              gap: "6px",
            }}
          >
            <Edit3 size={15} />
            <span>Sign with finger or stylus</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button
          type="button"
          onClick={clearCanvas}
          className={styles.buttonPearlCapsule}
          style={{ padding: "6px 12px", fontSize: "13px" }}
        >
          <Eraser size={13} />
          <span>Clear Signature</span>
        </button>
      </div>
    </div>
  )
}
