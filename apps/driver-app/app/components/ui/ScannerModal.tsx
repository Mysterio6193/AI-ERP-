"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Flashlight, Keyboard, ScanLine, X } from "lucide-react"
import { audioFeedback } from "./AudioFeedback"

interface ScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (barcode: string) => void
  title?: string
  hint?: string
}

export function ScannerModal({
  isOpen,
  onClose,
  onScan,
  title = "Scan Barcode / SKU",
  hint = "Align barcode within the viewfinder or enter SKU",
}: ScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [manualCode, setManualCode] = useState("")
  const [cameraActive, setCameraActive] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const manualInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      stopCamera()
      setManualCode("")
      return
    }

    // Auto-focus manual input for hardware scanners
    setTimeout(() => {
      manualInputRef.current?.focus()
    }, 100)

    startCamera()

    return () => {
      stopCamera()
    }
  }, [isOpen])

  async function startCamera() {
    try {
      setCameraError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access not supported on this browser.")
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraActive(true)

        // If BarcodeDetector is supported in modern browsers
        if ("BarcodeDetector" in window) {
          const barcodeDetector = new (window as unknown as {
            BarcodeDetector: new (opts?: { formats: string[] }) => {
              detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>
            }
          }).BarcodeDetector({
            formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code", "upc_a", "upc_e"],
          })

          const detectInterval = setInterval(async () => {
            if (!videoRef.current || !streamRef.current?.active) {
              clearInterval(detectInterval)
              return
            }
            try {
              const barcodes = await barcodeDetector.detect(videoRef.current)
              if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                const detected = barcodes[0].rawValue.trim()
                if (detected) {
                  clearInterval(detectInterval)
                  audioFeedback.playScanBeep()
                  onScan(detected)
                  onClose()
                }
              }
            } catch {
              // Ignore frame detection failures
            }
          }, 300)
        }
      }
    } catch (err) {
      console.warn("Camera access failed:", err)
      setCameraError("Camera unavailable or permission denied. You can still type or scan with a hardware scanner.")
      setCameraActive(false)
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
    setTorchOn(false)
  }

  async function toggleTorch() {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    if (!track) return

    try {
      const nextState = !torchOn
      await (track as unknown as { applyConstraints: (c: unknown) => Promise<void> }).applyConstraints({
        advanced: [{ torch: nextState }],
      })
      setTorchOn(nextState)
    } catch {
      // Torch not supported
    }
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = manualCode.trim()
    if (!trimmed) return
    audioFeedback.playScanBeep()
    onScan(trimmed)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(2, 6, 23, 0.95)",
        backdropFilter: "blur(12px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid rgba(148, 163, 184, 0.15)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background: "rgba(56, 189, 248, 0.15)",
              color: "#38bdf8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ScanLine size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "#f8fafc" }}>{title}</h3>
            <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>{hint}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.1)",
            border: "none",
            color: "#e2e8f0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Viewfinder / Camera Area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: "#000",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          style={{
            position: "absolute",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: cameraActive ? 1 : 0.2,
          }}
        />

        {/* Viewfinder Target Reticle */}
        <div
          style={{
            position: "relative",
            width: "280px",
            height: "220px",
            border: "2px solid rgba(56, 189, 248, 0.8)",
            borderRadius: "16px",
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          {/* Animated Red Laser Scan Line */}
          <div
            style={{
              position: "absolute",
              left: "10px",
              right: "10px",
              height: "2px",
              background: "linear-gradient(90deg, transparent, #ef4444, #f87171, #ef4444, transparent)",
              boxShadow: "0 0 8px #ef4444",
              animation: "scanSweep 2s ease-in-out infinite",
            }}
          />

          {/* Corner Markers */}
          <div style={{ position: "absolute", top: -2, left: -2, width: 24, height: 24, borderTop: "4px solid #38bdf8", borderLeft: "4px solid #38bdf8", borderTopLeftRadius: 16 }} />
          <div style={{ position: "absolute", top: -2, right: -2, width: 24, height: 24, borderTop: "4px solid #38bdf8", borderRight: "4px solid #38bdf8", borderTopRightRadius: 16 }} />
          <div style={{ position: "absolute", bottom: -2, left: -2, width: 24, height: 24, borderBottom: "4px solid #38bdf8", borderLeft: "4px solid #38bdf8", borderBottomLeftRadius: 16 }} />
          <div style={{ position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderBottom: "4px solid #38bdf8", borderRight: "4px solid #38bdf8", borderBottomRightRadius: 16 }} />
        </div>

        {/* Torch Button if stream active */}
        {cameraActive && (
          <button
            type="button"
            onClick={toggleTorch}
            style={{
              position: "absolute",
              bottom: "20px",
              right: "20px",
              zIndex: 20,
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: torchOn ? "#eab308" : "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: torchOn ? "#000" : "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <Flashlight size={20} />
          </button>
        )}

        {cameraError && (
          <div
            style={{
              position: "absolute",
              top: "20px",
              left: "20px",
              right: "20px",
              zIndex: 20,
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "10px",
              padding: "10px 14px",
              color: "#fca5a5",
              fontSize: "12px",
              textAlign: "center",
            }}
          >
            {cameraError}
          </div>
        )}
      </div>

      {/* Manual Input Form (also works with USB/Bluetooth laser scanners) */}
      <form
        onSubmit={handleManualSubmit}
        style={{
          padding: "16px 20px",
          background: "#0f172a",
          borderTop: "1px solid rgba(148, 163, 184, 0.15)",
          display: "flex",
          gap: "10px",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <Keyboard
            size={18}
            style={{
              position: "absolute",
              left: "14px",
              top: "50%",
              transform: "translateY(-50%)",
              color: "#64748b",
            }}
          />
          <input
            ref={manualInputRef}
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Type or laser scan SKU / Barcode..."
            style={{
              width: "100%",
              padding: "12px 14px 12px 42px",
              borderRadius: "10px",
              background: "#1e293b",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              color: "#f8fafc",
              fontSize: "14px",
              outline: "none",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={!manualCode.trim()}
          style={{
            padding: "12px 20px",
            borderRadius: "10px",
            background: manualCode.trim() ? "#0284c7" : "rgba(2, 132, 199, 0.3)",
            border: "none",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "14px",
            cursor: manualCode.trim() ? "pointer" : "default",
            whiteSpace: "nowrap",
          }}
        >
          Submit
        </button>
      </form>
    </div>
  )
}
