"use client"

import { useEffect, useRef, useState } from "react"
import { Eraser, PenLine } from "lucide-react"

interface SignaturePadProps {
  onSave: (dataUrl: string) => void
  onClear?: () => void
  initialValue?: string
  disabled?: boolean
}

export function SignaturePad({ onSave, onClear, initialValue, disabled }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawing = useRef(false)
  const [hasDrawn, setHasDrawn] = useState(Boolean(initialValue))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Set high-DPI canvas size
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    ctx.strokeStyle = "#ffffff"
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
  }, [])

  function getPoint(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()

    if ("touches" in e) {
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      }
    } else {
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      }
    }
  }

  function startDrawing(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (disabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    isDrawing.current = true
    const { x, y } = getPoint(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setHasDrawn(true)
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing.current || disabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    if ("touches" in e) {
      e.preventDefault() // prevent scroll on touch
    }

    const { x, y } = getPoint(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function stopDrawing() {
    if (!isDrawing.current) return
    isDrawing.current = false
    const canvas = canvasRef.current
    if (!canvas) return

    const dataUrl = canvas.toDataURL("image/png")
    onSave(dataUrl)
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    ctx.clearRect(0, 0, rect.width, rect.height)
    setHasDrawn(false)
    onClear?.()
    onSave("")
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "160px",
          background: "rgba(15, 23, 42, 0.85)",
          border: "1.5px dashed rgba(148, 163, 184, 0.3)",
          borderRadius: "12px",
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
            cursor: disabled ? "not-allowed" : "crosshair",
            display: "block",
          }}
        />

        {!hasDrawn && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "rgba(148, 163, 184, 0.6)",
              fontSize: "14px",
              pointerEvents: "none",
            }}
          >
            <PenLine size={16} />
            <span>Sign here (Recipient or Driver)</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasDrawn}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            color: hasDrawn ? "#94a3b8" : "rgba(148, 163, 184, 0.3)",
            background: "transparent",
            border: "none",
            padding: "4px 8px",
            cursor: hasDrawn ? "pointer" : "default",
          }}
        >
          <Eraser size={14} />
          <span>Clear Signature</span>
        </button>
      </div>
    </div>
  )
}
