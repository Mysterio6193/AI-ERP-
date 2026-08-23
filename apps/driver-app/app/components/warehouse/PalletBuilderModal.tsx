"use client"

import { useState } from "react"
import {
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Layers,
  MapPin,
  Package,
  Printer,
  QrCode,
  ShieldCheck,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { PalletData, SSCCPalletLabelModal } from "./SSCCPalletLabelModal"
import styles from "../../page.module.css"

interface PalletBuilderModalProps {
  isOpen: boolean
  onClose: () => void
  mode: "inbound" | "outbound"
  defaultProductOrCustomer?: string
  defaultOrderNo?: string
  onComplete: (pallet: PalletData) => void
}

const PALLET_TYPES = [
  "CHEP (1165×1165)",
  "LOSCAM (1165×1165)",
  "Plain Wood",
  "Plastic Export",
  "Euro (1200×800)",
] as const

const PALLET_RACKS = [
  "RACK-A-01-01 (Ground)",
  "RACK-A-01-02 (Level 2)",
  "RACK-A-01-03 (Level 3)",
  "RACK-A-01-04 (High Bay)",
  "RACK-B-02-01 (Ground)",
  "RACK-B-02-04 (High Bay)",
  "COLD-RACK-01 (Chilled)",
  "COLD-RACK-02 (Freezer)",
  "DOCK-STAGING-01",
]

export function PalletBuilderModal({
  isOpen,
  onClose,
  mode,
  defaultProductOrCustomer,
  defaultOrderNo,
  onComplete,
}: PalletBuilderModalProps) {
  const [palletType, setPalletType] = useState<typeof PALLET_TYPES[number]>(PALLET_TYPES[0])
  const [layers, setLayers] = useState<number>(5)
  const [cartonsPerLayer, setCartonsPerLayer] = useState<number>(10)
  const [cartonWeightKg, setCartonWeightKg] = useState<number>(12)
  const [palletRackLocation, setPalletRackLocation] = useState(PALLET_RACKS[0])
  const [palletWrapped, setPalletWrapped] = useState(true)
  const [tempRequired, setTempRequired] = useState<"Ambient" | "Chilled (2°C)" | "Frozen (-18°C)">("Ambient")
  const [batchCode, setBatchCode] = useState(`LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`)

  // Active SSCC Label preview
  const [ssccPreview, setSsccPreview] = useState<PalletData | null>(null)

  if (!isOpen) return null

  const totalCartons = layers * cartonsPerLayer
  const totalNetWeight = totalCartons * cartonWeightKg
  const grossWeightKg = totalNetWeight + (palletType.includes("Plastic") ? 15 : 35)

  // Generate standard 18-digit SSCC
  const generatedSSCC = `09312345${Math.floor(100000000 + Math.random() * 900000000)}`
  const palletId = `PAL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`

  function handleSavePallet() {
    const data: PalletData = {
      sscc: generatedSSCC,
      palletNumber: palletId,
      palletType,
      orderNumber: defaultOrderNo || "PO-BULK-01",
      customerName: defaultProductOrCustomer || "Warehouse Distribution",
      deliveryAddress: "3PL Freight Terminal / High Bay Storage",
      carrierName: "Internal / 3PL Linehaul",
      totalCartons,
      layers,
      cartonsPerLayer,
      grossWeightKg,
      batchCode,
      temperatureRequired: tempRequired,
    }

    audioFeedback.playSuccessChime()
    onComplete(data)
    setSsccPreview(data)
  }

  return (
    <>
      <div className={styles.modalOverlay}>
        <div className={styles.modalContent} style={{ maxWidth: "580px" }}>
          <div className={styles.modalHeader}>
            <div>
              <span className={styles.heroTaglineLight}>
                {mode === "inbound" ? "Pallet In Receiving" : "Pallet Out Consolidation"}
              </span>
              <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
                {mode === "inbound" ? "Receive & Put-away Full Pallet" : "Build Outbound Pallet"}
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
            {/* Pallet Type Selector */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Pallet Hardware Type</label>
              <div className={styles.pillGroup}>
                {PALLET_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPalletType(t)}
                    className={palletType === t ? styles.optionChipSelected : styles.optionChip}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Ti-Hi Configuration (Layers × Cartons per layer) */}
            <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "16px" }}>
              <div className={styles.cardHeaderRow}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <Layers size={16} style={{ color: "var(--primary)" }} />
                  <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>
                    Ti-Hi Configuration (Stack Matrix)
                  </h4>
                </div>
                <span className={styles.cardTagHighlight}>
                  Total: {totalCartons} Cartons ({grossWeightKg} kg Gross)
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginTop: "12px" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Layers (Hi)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={layers}
                    onChange={(e) => setLayers(Math.max(1, Number(e.target.value) || 1))}
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Cartons/Layer (Ti)</label>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={cartonsPerLayer}
                    onChange={(e) => setCartonsPerLayer(Math.max(1, Number(e.target.value) || 1))}
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Per Carton Wt (kg)</label>
                  <input
                    type="number"
                    min={0.5}
                    value={cartonWeightKg}
                    onChange={(e) => setCartonWeightKg(Math.max(0.1, Number(e.target.value) || 1))}
                    className={styles.textInput}
                  />
                </div>
              </div>
            </div>

            {/* Target Pallet Racking Location */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                {mode === "inbound" ? "Put-away High Bay Racking" : "Staging Dock Location"}
              </label>
              <select
                value={palletRackLocation}
                onChange={(e) => setPalletRackLocation(e.target.value)}
                className={styles.selectInput}
              >
                {PALLET_RACKS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </div>

            {/* Temperature Requirements & Lot Code */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Temperature Class</label>
                <select
                  value={tempRequired}
                  onChange={(e) => setTempRequired(e.target.value as any)}
                  className={styles.selectInput}
                >
                  <option value="Ambient">Ambient Dry</option>
                  <option value="Chilled (2°C)">Chilled (+2°C to +4°C)</option>
                  <option value="Frozen (-18°C)">Frozen (-18°C)</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Batch / Lot Identifier</label>
                <input
                  type="text"
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                  className={styles.textInput}
                />
              </div>
            </div>

            {/* Wrapping & Safety Confirmation */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "var(--canvas-parchment)",
                borderRadius: "11px",
                border: "1px solid var(--hairline)",
              }}
            >
              <div>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                  Stretch Wrapped & Strapped
                </span>
                <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted-48)" }}>
                  High-bay storage & transport security verified
                </p>
              </div>
              <input
                type="checkbox"
                checked={palletWrapped}
                onChange={(e) => setPalletWrapped(e.target.checked)}
                style={{ width: "18px", height: "18px", accentColor: "var(--primary)", cursor: "pointer" }}
              />
            </div>

            <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
              <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePallet}
                className={styles.buttonPrimary}
                style={{ flex: 2 }}
              >
                <QrCode size={16} />
                <span>{mode === "inbound" ? "Receive & Print SSCC" : "Consolidate & Tag Pallet"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* GS1 SSCC Pallet Label Modal */}
      {ssccPreview && (
        <SSCCPalletLabelModal
          isOpen={Boolean(ssccPreview)}
          onClose={() => {
            setSsccPreview(null)
            onClose()
          }}
          pallet={ssccPreview}
        />
      )}
    </>
  )
}
