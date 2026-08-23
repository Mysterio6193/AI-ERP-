"use client"

import { useEffect, useRef, useState } from "react"
import { Camera, Flashlight, RefreshCw, X, Zap } from "lucide-react"
import { audioFeedback } from "./AudioFeedback"
import styles from "../../page.module.css"

interface ScannerModalProps {
  isOpen: boolean
  onClose: () => void
  onScan: (scannedCode: string) => void
  title?: string
  hint?: string
}

export function ScannerModal({
  isOpen,
  onClose,
  onScan,
  title = "Barcode Scanner",
  hint = "Position barcode within viewfinder",
}: ScannerModalProps) {
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [manualCode, setManualCode] = useState("")

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    if (isOpen) {
      void startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [isOpen])

  // Keydown listener for physical laser barcode scanners
  useEffect(() => {
    if (!isOpen) return

    let scanBuffer = ""
    let lastKeyTime = Date.now()

    const handleKeyDown = (e: KeyboardEvent) => {
      const now = Date.now()
      if (now - lastKeyTime > 100) {
        scanBuffer = ""
      }
      lastKeyTime = now

      if (e.key === "Enter") {
        if (scanBuffer.length >= 3) {
          e.preventDefault()
          handleDetectedCode(scanBuffer)
          scanBuffer = ""
        }
      } else if (e.key.length === 1) {
        scanBuffer += e.key
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  async function startCamera() {
    try {
      setCameraError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera access not supported in this browser.")
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraActive(true)
      }
    } catch (err) {
      console.warn("Camera init warning:", err)
      setCameraError("Camera permission denied or camera not found.")
      setCameraActive(false)
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
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
      const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined
      if (capabilities && capabilities.torch) {
        const nextState = !torchOn
        await track.applyConstraints({
          advanced: [{ torch: nextState } as MediaTrackConstraintSet],
        })
        setTorchOn(nextState)
      }
    } catch (err) {
      console.warn("Torch not supported:", err)
    }
  }

  function handleDetectedCode(code: string) {
    if (!code.trim()) return
    audioFeedback.playScanBeep()
    onScan(code.trim())
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxWidth: "500px" }}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.heroTaglineLight}>Optical Scanner</span>
            <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={styles.buttonIconCircular}
            style={{ width: "32px", height: "32px" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.modalBody} style={{ padding: "20px" }}>
          {/* Viewfinder Window */}
          <div
            style={{
              position: "relative",
              height: "260px",
              background: "#000000",
              borderRadius: "14px",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: cameraActive ? "block" : "none",
              }}
            />

            {!cameraActive && (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "20px" }}>
                <Camera size={36} style={{ margin: "0 auto 8px auto", opacity: 0.6 }} />
                <p style={{ margin: 0, fontSize: "14px" }}>
                  {cameraError || "Camera scanner active (Hardware Laser Ready)"}
                </p>
              </div>
            )}

            {/* Laser Line */}
            {cameraActive && (
              <div
                style={{
                  position: "absolute",
                  left: "15%",
                  right: "15%",
                  height: "2px",
                  backgroundColor: "var(--primary-on-dark)",
                  boxShadow: "0 0 10px #2997ff",
                  animation: `${styles.scanSweep} 2.5s ease-in-out infinite`,
                }}
              />
            )}

            {/* Torch Control Button */}
            {cameraActive && (
              <button
                type="button"
                onClick={toggleTorch}
                className={styles.buttonIconCircular}
                style={{
                  position: "absolute",
                  bottom: "12px",
                  right: "12px",
                  background: torchOn ? "var(--primary)" : "rgba(210, 210, 215, 0.64)",
                  color: torchOn ? "#ffffff" : "var(--ink)",
                }}
              >
                <Flashlight size={18} />
              </button>
            )}
          </div>

          <p style={{ textAlign: "center", fontSize: "14px", color: "var(--ink-muted-80)", margin: "4px 0" }}>
            {hint}
          </p>

          {/* Manual Entry or Laser Scanner Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleDetectedCode(manualCode)
            }}
            style={{ display: "flex", gap: "8px", marginTop: "8px" }}
          >
            <input
              type="text"
              autoFocus
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Enter SKU / Scan with Laser..."
              className={styles.searchInput}
              style={{ flex: 1, height: "42px" }}
            />
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className={styles.buttonPrimary}
              style={{ padding: "0 20px" }}
            >
              Submit
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
