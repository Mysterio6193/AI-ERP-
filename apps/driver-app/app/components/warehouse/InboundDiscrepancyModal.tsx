"use client"

import { useState } from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileWarning,
  Package,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { PhotoCapture } from "../ui/PhotoCapture"
import styles from "../../page.module.css"

interface InboundDiscrepancyModalProps {
  isOpen: boolean
  onClose: () => void
  poNumber: string
  supplierName: string
  items: Array<{ id: string; name: string; sku: string; orderedQty: number }>
  onLogDiscrepancy: (report: Record<string, unknown>) => Promise<void>
}

export function InboundDiscrepancyModal({
  isOpen,
  onClose,
  poNumber,
  supplierName,
  items,
  onLogDiscrepancy,
}: InboundDiscrepancyModalProps) {
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id || "")
  const [discrepancyType, setDiscrepancyType] = useState<"damaged" | "shortage" | "overage" | "wrong_item">("damaged")
  const [affectedQty, setAffectedQty] = useState<number>(1)
  const [damagePhotoUrl, setDamagePhotoUrl] = useState<string>("")
  const [quarantineBin, setQuarantineBin] = useState<string>("Q-01 (Damaged/Return)")
  const [supplierCreditRequested, setSupplierCreditRequested] = useState<boolean>(true)
  const [notes, setNotes] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const activeItem = items.find((it) => it.id === selectedItemId) || items[0]

  async function handleSubmit() {
    try {
      setSubmitting(true)
      await onLogDiscrepancy({
        poNumber,
        supplierName,
        productId: activeItem?.id,
        productName: activeItem?.name,
        sku: activeItem?.sku,
        discrepancyType,
        affectedQty,
        damagePhotoUrl: damagePhotoUrl || undefined,
        quarantineBin,
        supplierCreditRequested,
        notes,
        reportedAt: new Date().toISOString(),
      })

      audioFeedback.playSuccessChime()
      onClose()
    } catch (err) {
      console.error(err)
      audioFeedback.playErrorBuzz()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxWidth: "560px" }}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.statLabel} style={{ color: "#b91c1c" }}>Inbound Quality & Non-Conformance</span>
            <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
              Supplier Discrepancy Report (OS&D)
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
          <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "14px 18px" }}>
            <div className={styles.cardHeaderRow}>
              <span className={styles.cardSequenceBadge}>PO #{poNumber}</span>
              <span className={styles.cardTag}>Supplier: {supplierName}</span>
            </div>
          </div>

          {/* Item Selector */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Affected Product</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className={styles.selectInput}
            >
              {items.map((it) => (
                <option key={it.id} value={it.id}>
                  {it.sku} — {it.name} (Ordered: {it.orderedQty})
                </option>
              ))}
            </select>
          </div>

          {/* Discrepancy Type */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Discrepancy Category</label>
            <div className={styles.pillGroup}>
              <button
                type="button"
                onClick={() => setDiscrepancyType("damaged")}
                className={discrepancyType === "damaged" ? styles.optionChipSelected : styles.optionChip}
              >
                Damaged / Spoilage
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyType("shortage")}
                className={discrepancyType === "shortage" ? styles.optionChipSelected : styles.optionChip}
              >
                Short Delivery
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyType("wrong_item")}
                className={discrepancyType === "wrong_item" ? styles.optionChipSelected : styles.optionChip}
              >
                Incorrect SKU
              </button>
              <button
                type="button"
                onClick={() => setDiscrepancyType("overage")}
                className={discrepancyType === "overage" ? styles.optionChipSelected : styles.optionChip}
              >
                Overage Extra
              </button>
            </div>
          </div>

          {/* Affected Qty & Quarantine Location */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "10px" }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Affected Units</label>
              <input
                type="number"
                min={1}
                value={affectedQty}
                onChange={(e) => setAffectedQty(Math.max(1, Number(e.target.value) || 1))}
                className={styles.textInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Quarantine Bin</label>
              <input
                type="text"
                value={quarantineBin}
                onChange={(e) => setQuarantineBin(e.target.value)}
                className={styles.textInput}
              />
            </div>
          </div>

          {/* Damage Photo Evidence */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Damage Photo Proof</label>
            <PhotoCapture
              value={damagePhotoUrl}
              onChange={(url) => setDamagePhotoUrl(url)}
              label="Capture Photo of Damaged Goods"
              purpose="inbound_damage"
            />
          </div>

          {/* Supplier Credit Claim Checkbox */}
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
                Issue Supplier Credit Claim
              </span>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted-48)" }}>
                Automatically flag accounts payable for invoice deduction
              </p>
            </div>
            <input
              type="checkbox"
              checked={supplierCreditRequested}
              onChange={(e) => setSupplierCreditRequested(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--primary)", cursor: "pointer" }}
            />
          </div>

          {/* Notes */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Discrepancy Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Pallet tipped during transit, 4 cartons crushed and leaking."
              rows={2}
              className={styles.textArea}
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className={styles.buttonPrimary}
              style={{ flex: 2, background: "var(--ink)" }}
            >
              <AlertTriangle size={16} />
              <span>{submitting ? "Logging..." : "Log & Quarantine Stock"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
