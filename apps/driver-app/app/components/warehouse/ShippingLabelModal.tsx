"use client"

import { useState } from "react"
import { Check, Download, Package, Printer, QrCode, X } from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import styles from "../../page.module.css"

interface ShippingLabelModalProps {
  isOpen: boolean
  onClose: () => void
  order: {
    orderNumber: string
    customerName: string
    deliveryAddress: string
    totalCartons: number
    totalWeight: number
    carrierName?: string | null
    consignmentNumber?: string | null
    requiredDate?: string | null
  }
}

export function ShippingLabelModal({ isOpen, onClose, order }: ShippingLabelModalProps) {
  const [currentCarton, setCurrentCarton] = useState(1)
  const [printing, setPrinting] = useState(false)

  if (!isOpen) return null

  const carrier = order.carrierName || "Direct Fleet Express"
  const consignment = order.consignmentNumber || `EXP-${order.orderNumber}`

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
      <div className={styles.modalContent} style={{ maxWidth: "520px" }}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.heroTaglineLight}>Thermal Dispatch Engine</span>
            <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
              4×6″ Shipping Label
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
          {/* Carton Selector if multi-carton */}
          {order.totalCartons > 1 && (
            <div className={styles.pillGroup}>
              {Array.from({ length: order.totalCartons }, (_, i) => i + 1).map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCurrentCarton(num)}
                  className={currentCarton === num ? styles.optionChipSelected : styles.optionChip}
                >
                  Carton {num} of {order.totalCartons}
                </button>
              ))}
            </div>
          )}

          {/* Thermal Label Rendering Canvas */}
          <div
            style={{
              background: "#ffffff",
              border: "2px solid #1d1d1f",
              borderRadius: "8px",
              padding: "20px",
              fontFamily: "'Courier New', Courier, monospace",
              color: "#000000",
              boxShadow: "var(--product-shadow)",
            }}
          >
            {/* Top Barcode Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "2px solid #000000",
                paddingBottom: "10px",
              }}
            >
              <div>
                <span style={{ fontSize: "16px", fontWeight: "bold", textTransform: "uppercase" }}>
                  {carrier}
                </span>
                <p style={{ margin: 0, fontSize: "12px" }}>STANDARD PRIORITY ROAD</p>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "18px", fontWeight: "bold" }}>
                  {currentCarton} / {order.totalCartons}
                </span>
                <p style={{ margin: 0, fontSize: "11px" }}>CARTON</p>
              </div>
            </div>

            {/* Carrier Routing Barcode Simulation (Vector) */}
            <div style={{ textAlign: "center", padding: "12px 0", borderBottom: "1px solid #000000" }}>
              <svg viewBox="0 0 320 50" style={{ width: "100%", height: "45px" }}>
                {Array.from({ length: 55 }).map((_, i) => (
                  <rect
                    key={i}
                    x={i * 5.8}
                    y="0"
                    width={i % 3 === 0 ? "3" : i % 2 === 0 ? "1.5" : "4"}
                    height="45"
                    fill="#000000"
                  />
                ))}
              </svg>
              <span style={{ fontSize: "13px", fontWeight: "bold", letterSpacing: "2px" }}>
                *{consignment}*
              </span>
            </div>

            {/* Consignee Destination Address */}
            <div style={{ padding: "14px 0", borderBottom: "2px solid #000000" }}>
              <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "1px" }}>
                DELIVER TO:
              </span>
              <h3 style={{ margin: "4px 0", fontSize: "18px", fontWeight: "bold" }}>
                {order.customerName}
              </h3>
              <p style={{ margin: 0, fontSize: "14px", lineHeight: "1.3" }}>
                {order.deliveryAddress}
              </p>
            </div>

            {/* Bottom Meta & QR Code */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: "12px",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: "12px" }}>
                  <strong>ORDER:</strong> #{order.orderNumber}
                </p>
                <p style={{ margin: 0, fontSize: "12px" }}>
                  <strong>WEIGHT:</strong> {order.totalWeight || 12} KG
                </p>
                <p style={{ margin: 0, fontSize: "11px", color: "#555" }}>
                  DATE: {new Date().toLocaleDateString()}
                </p>
              </div>

              {/* QR Code SVG */}
              <div
                style={{
                  width: "60px",
                  height: "60px",
                  border: "1px solid #000",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <QrCode size={48} />
              </div>
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
              <span>{printing ? "Printing..." : "Print 4×6″ Label"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
