"use client"

import { useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { PickItem } from "./WarehousePickingView"
import styles from "../../page.module.css"

interface ShortPickModalProps {
  isOpen: boolean
  onClose: () => void
  item: PickItem
  onConfirmShortPick: (payload: {
    itemId: string
    actualPickedQty: number
    shortQty: number
    reason: string
    action: "backorder" | "cancel" | "alternate_bin"
    alternateBin?: string
  }) => Promise<void>
}

const SHORT_REASONS = [
  "Bin Empty / Stock Depleted",
  "Stock Damaged / Unsellable in Bin",
  "Product Expired / Past Best Before",
  "Incorrect Product in Bin",
  "Bin Inaccessible / Blocked",
]

const MOCK_ALTERNATE_BINS = [
  { bin: "A-03-B", qtyAvailable: 15, zone: "Aisle A Reserve" },
  { bin: "BULK-RACK-02", qtyAvailable: 48, zone: "High Bay Storage" },
]

export function ShortPickModal({
  isOpen,
  onClose,
  item,
  onConfirmShortPick,
}: ShortPickModalProps) {
  const [actualPickedQty, setActualPickedQty] = useState<number>(item.pickedQty)
  const [reason, setReason] = useState<string>(SHORT_REASONS[0])
  const [action, setAction] = useState<"backorder" | "cancel" | "alternate_bin">("backorder")
  const [selectedAlternateBin, setSelectedAlternateBin] = useState<string>(MOCK_ALTERNATE_BINS[0].bin)
  const [saving, setSaving] = useState(false)

  if (!isOpen) return null

  const shortQty = Math.max(0, item.requiredQty - actualPickedQty)

  async function handleConfirm() {
    try {
      setSaving(true)
      await onConfirmShortPick({
        itemId: item.id,
        actualPickedQty,
        shortQty,
        reason,
        action,
        alternateBin: action === "alternate_bin" ? selectedAlternateBin : undefined,
      })
      audioFeedback.playSuccessChime()
      onClose()
    } catch (err) {
      console.error(err)
      audioFeedback.playErrorBuzz()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxWidth: "540px" }}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.statLabel} style={{ color: "#b91c1c" }}>Short Pick Resolution</span>
            <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
              {item.productName}
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
          {/* Bin & Required Info Banner */}
          <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "14px 18px" }}>
            <div className={styles.cardHeaderRow}>
              <span className={styles.cardTagHighlight}>
                <MapPin size={12} /> Primary Bin: {item.location}
              </span>
              <span className={styles.cardSequenceBadge}>SKU: {item.sku}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "10px", textAlign: "center" }}>
              <div>
                <span className={styles.statLabel}>Target Required</span>
                <span style={{ display: "block", fontSize: "16px", fontWeight: 600 }}>{item.requiredQty}</span>
              </div>
              <div>
                <span className={styles.statLabel}>Found in Bin</span>
                <span style={{ display: "block", fontSize: "16px", fontWeight: 600, color: "var(--primary)" }}>
                  {actualPickedQty}
                </span>
              </div>
              <div>
                <span className={styles.statLabel}>Shortfall</span>
                <span style={{ display: "block", fontSize: "16px", fontWeight: 600, color: "#b91c1c" }}>
                  {shortQty}
                </span>
              </div>
            </div>
          </div>

          {/* Actual Found Quantity Adjustment */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Actual Usable Quantity Picked from Bin</label>
            <input
              type="number"
              min={0}
              max={item.requiredQty}
              value={actualPickedQty}
              onChange={(e) => setActualPickedQty(Math.min(item.requiredQty, Math.max(0, Number(e.target.value) || 0)))}
              className={styles.textInput}
              style={{ fontSize: "18px", fontWeight: 600, textAlign: "center" }}
            />
          </div>

          {/* Short Reason */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Reason for Shortfall</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={styles.selectInput}
            >
              {SHORT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Action Resolution Selector */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Resolution Flow for Remaining {shortQty} Units</label>
            <div className={styles.pillGroup}>
              <button
                type="button"
                onClick={() => setAction("backorder")}
                className={action === "backorder" ? styles.optionChipSelected : styles.optionChip}
              >
                Create Backorder Line
              </button>
              <button
                type="button"
                onClick={() => setAction("alternate_bin")}
                className={action === "alternate_bin" ? styles.optionChipSelected : styles.optionChip}
              >
                Pick from Alternate Bin
              </button>
              <button
                type="button"
                onClick={() => setAction("cancel")}
                className={action === "cancel" ? styles.optionChipSelected : styles.optionChip}
              >
                Cancel Short Balance
              </button>
            </div>
          </div>

          {/* If Alternate Bin is chosen */}
          {action === "alternate_bin" && (
            <div className={styles.utilityCard} style={{ padding: "14px", border: "1px solid var(--primary)" }}>
              <span className={styles.statLabel} style={{ color: "var(--primary)" }}>
                Warehouse Alternate Bin Locations
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "8px" }}>
                {MOCK_ALTERNATE_BINS.map((b) => (
                  <div
                    key={b.bin}
                    onClick={() => setSelectedAlternateBin(b.bin)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: selectedAlternateBin === b.bin ? "rgba(0, 102, 204, 0.08)" : "var(--canvas-parchment)",
                      border: selectedAlternateBin === b.bin ? "1px solid var(--primary)" : "1px solid var(--hairline)",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, color: "var(--ink)" }}>{b.bin}</span>
                      <span style={{ display: "block", fontSize: "12px", color: "var(--ink-muted-48)" }}>{b.zone}</span>
                    </div>
                    <span className={styles.cardTagHighlight}>{b.qtyAvailable} Units Available</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className={styles.buttonPrimary}
              style={{ flex: 2, background: "var(--ink)" }}
            >
              <AlertTriangle size={16} />
              <span>{saving ? "Processing..." : `Log Short Pick (${actualPickedQty}/${item.requiredQty})`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
