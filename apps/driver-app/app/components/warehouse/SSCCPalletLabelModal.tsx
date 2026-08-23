"use client"

import { useState } from "react"
import { Layers, Package, Printer, QrCode, X } from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import styles from "../../page.module.css"

export interface PalletData {
  sscc: string
  palletNumber: string
  palletType: "CHEP (1165×1165)" | "LOSCAM (1165×1165)" | "Plain Wood" | "Plastic Export" | "Euro (1200×800)"
  orderNumber: string
  customerName: string
  deliveryAddress: string
  carrierName: string
  totalCartons: number
  layers: number
  cartonsPerLayer: number
  grossWeightKg: number
  batchCode?: string
  expiryDate?: string
  temperatureRequired?: string
}

interface SSCCPalletLabelModalProps {
  isOpen: boolean
  onClose: () => void
  pallet: PalletData
}

export function SSCCPalletLabelModal({ isOpen, onClose, pallet }: SSCCPalletLabelModalProps) {
  const [printing, setPrinting] = useState(false)

  if (!isOpen) return null

  function handlePrint() {
    setPrinting(true)
    audioFeedback.playSuccessChime()
    setTimeout(() => {
      window.print()
      setPrinting(false)
    }, 300)
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxWidth: "560px" }}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.heroTaglineLight}>GS1-128 Logistics Label</span>
            <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
              SSCC Pallet Tag ({pallet.palletNumber})
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

        <div className={styles.modalBody}>
          {/* GS1 Logistics Pallet Label Rendering Canvas */}
          <div
            style={{
              background: "#ffffff",
              border: "2px solid #000000",
              borderRadius: "4px",
              padding: "20px",
              fontFamily: "'Courier New', Courier, monospace",
              color: "#000000",
              boxShadow: "var(--product-shadow)",
            }}
          >
            {/* Top Ship From & Ship To */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1.2fr",
                gap: "12px",
                borderBottom: "2px solid #000000",
                paddingBottom: "12px",
              }}
            >
              <div style={{ borderRight: "1px solid #000000", paddingRight: "10px" }}>
                <span style={{ fontSize: "10px", fontWeight: "bold" }}>FROM:</span>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", fontWeight: "bold" }}>
                  SUPPLYSURE OS
                </p>
                <p style={{ margin: 0, fontSize: "11px" }}>Main Distribution DC</p>
                <p style={{ margin: 0, fontSize: "11px" }}>Sydney NSW 2000</p>
              </div>

              <div>
                <span style={{ fontSize: "10px", fontWeight: "bold" }}>SHIP TO:</span>
                <h4 style={{ margin: "2px 0 0 0", fontSize: "14px", fontWeight: "bold" }}>
                  {pallet.customerName}
                </h4>
                <p style={{ margin: 0, fontSize: "12px", lineHeight: "1.2" }}>
                  {pallet.deliveryAddress}
                </p>
              </div>
            </div>

            {/* Carrier & Transport Meta */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.2fr 1fr 1fr",
                gap: "8px",
                borderBottom: "2px solid #000000",
                padding: "8px 0",
              }}
            >
              <div>
                <span style={{ fontSize: "10px" }}>CARRIER / 3PL</span>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: "bold" }}>
                  {pallet.carrierName}
                </p>
              </div>
              <div>
                <span style={{ fontSize: "10px" }}>PALLET TYPE</span>
                <p style={{ margin: 0, fontSize: "12px", fontWeight: "bold" }}>
                  {pallet.palletType}
                </p>
              </div>
              <div>
                <span style={{ fontSize: "10px" }}>ORDER #</span>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: "bold" }}>
                  {pallet.orderNumber}
                </p>
              </div>
            </div>

            {/* Pallet Configuration & Ti-Hi Breakdown */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "6px",
                borderBottom: "2px solid #000000",
                padding: "8px 0",
                textAlign: "center",
              }}
            >
              <div>
                <span style={{ fontSize: "10px" }}>CARTONS</span>
                <p style={{ margin: 0, fontSize: "15px", fontWeight: "bold" }}>
                  {pallet.totalCartons}
                </p>
              </div>
              <div>
                <span style={{ fontSize: "10px" }}>TI-HI</span>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: "bold" }}>
                  {pallet.cartonsPerLayer} × {pallet.layers}
                </p>
              </div>
              <div>
                <span style={{ fontSize: "10px" }}>GROSS WT</span>
                <p style={{ margin: 0, fontSize: "13px", fontWeight: "bold" }}>
                  {pallet.grossWeightKg} KG
                </p>
              </div>
              <div>
                <span style={{ fontSize: "10px" }}>TEMP REQ</span>
                <p style={{ margin: 0, fontSize: "12px", fontWeight: "bold" }}>
                  {pallet.temperatureRequired || "Ambient"}
                </p>
              </div>
            </div>

            {/* Lot & Expiry info if present */}
            {pallet.batchCode && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #000000",
                  padding: "6px 0",
                  fontSize: "11px",
                }}
              >
                <span>BATCH/LOT: <strong>{pallet.batchCode}</strong></span>
                {pallet.expiryDate && <span>EXP: <strong>{pallet.expiryDate}</strong></span>}
              </div>
            )}

            {/* GS1-128 Barcode Simulation */}
            <div style={{ textAlign: "center", padding: "14px 0 6px 0" }}>
              <span style={{ fontSize: "11px", fontWeight: "bold", letterSpacing: "1px" }}>
                SSCC (SERIAL SHIPPING CONTAINER CODE)
              </span>

              {/* Vector Barcode */}
              <div style={{ padding: "8px 0" }}>
                <svg viewBox="0 0 360 65" style={{ width: "100%", height: "60px" }}>
                  {Array.from({ length: 68 }).map((_, i) => (
                    <rect
                      key={i}
                      x={i * 5.2}
                      y="0"
                      width={i % 4 === 0 ? "3.5" : i % 2 === 0 ? "1.5" : "3"}
                      height="65"
                      fill="#000000"
                    />
                  ))}
                </svg>
              </div>

              <span
                style={{
                  fontSize: "16px",
                  fontWeight: "bold",
                  letterSpacing: "3px",
                  display: "block",
                  marginTop: "2px",
                }}
              >
                (00) {pallet.sscc}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
            <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={printing}
              className={styles.buttonPrimary}
              style={{ flex: 2 }}
            >
              <Printer size={16} />
              <span>{printing ? "Printing..." : "Print GS1-128 Pallet Label"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
