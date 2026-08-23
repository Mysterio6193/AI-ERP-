"use client"

import { useState } from "react"
import {
  Calculator,
  CheckCircle2,
  DollarSign,
  Receipt,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { DriverRoute } from "./DriverRouteView"
import styles from "../../page.module.css"

interface DriverCheckoutModalProps {
  isOpen: boolean
  onClose: () => void
  route: DriverRoute
  onCompleteCheckout: (summary: Record<string, unknown>) => Promise<void>
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(amount)
}

export function DriverCheckoutModal({
  isOpen,
  onClose,
  route,
  onCompleteCheckout,
}: DriverCheckoutModalProps) {
  const [actualCashHandover, setActualCashHandover] = useState<string>("")
  const [cardReceiptsTotal, setCardReceiptsTotal] = useState<string>("0")
  const [finalOdometer, setFinalOdometer] = useState<string>("142920")
  const [cashNotes, setCashNotes] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const deliveredStops = route.stops.filter((s) => s.status === "delivered")
  const failedStops = route.stops.filter((s) => s.status === "failed" || s.status === "returned")
  const expectedCodTotal = deliveredStops.reduce((sum, s) => sum + (s.codCollected ? s.codAmount : 0), 0)

  const actualCashNum = Number(actualCashHandover) || 0
  const cardNum = Number(cardReceiptsTotal) || 0
  const cashDiscrepancy = actualCashNum + cardNum - expectedCodTotal

  async function handleConfirmCloseout() {
    try {
      setSubmitting(true)
      await onCompleteCheckout({
        routeId: route.id,
        routeNumber: route.routeNumber,
        driverName: route.driverName,
        completedStops: deliveredStops.length,
        failedStops: failedStops.length,
        expectedCod: expectedCodTotal,
        actualCashTendered: actualCashNum,
        cardReceiptsTotal: cardNum,
        cashDiscrepancy,
        finalOdometer: Number(finalOdometer),
        cashNotes,
        timestamp: new Date().toISOString(),
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
            <span className={styles.heroTaglineLight}>End-of-Shift Reconciliation</span>
            <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
              Driver Run Checkout & Close-out
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
          {/* Run Performance Summary */}
          <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "16px" }}>
            <span className={styles.statLabel}>Today's Run Performance</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginTop: "8px", textAlign: "center" }}>
              <div>
                <span className={styles.statLabel}>Delivered</span>
                <span style={{ display: "block", fontSize: "18px", fontWeight: 600, color: "#15803d" }}>
                  {deliveredStops.length}
                </span>
              </div>
              <div>
                <span className={styles.statLabel}>Exceptions</span>
                <span style={{ display: "block", fontSize: "18px", fontWeight: 600, color: failedStops.length > 0 ? "#b91c1c" : "var(--ink)" }}>
                  {failedStops.length}
                </span>
              </div>
              <div>
                <span className={styles.statLabel}>Success Rate</span>
                <span style={{ display: "block", fontSize: "18px", fontWeight: 600, color: "var(--primary)" }}>
                  {route.totalStops > 0 ? Math.round((deliveredStops.length / route.totalStops) * 100) : 100}%
                </span>
              </div>
            </div>
          </div>

          {/* Cash & COD Reconciliation */}
          <div className={styles.utilityCard} style={{ padding: "16px" }}>
            <div className={styles.cardHeaderRow}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <DollarSign size={18} style={{ color: "var(--primary)" }} />
                <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>COD Money Reconciliation</h4>
              </div>
              <span className={styles.cardTagHighlight}>Expected: {formatMoney(expectedCodTotal)}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Physical Cash in Pouch ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={actualCashHandover}
                  onChange={(e) => setActualCashHandover(e.target.value)}
                  placeholder="0.00"
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>EFTPOS / Card Slips ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={cardReceiptsTotal}
                  onChange={(e) => setCardReceiptsTotal(e.target.value)}
                  className={styles.textInput}
                />
              </div>
            </div>

            {/* Variance indicator */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "10px 14px",
                background: cashDiscrepancy === 0 ? "var(--surface-pearl)" : cashDiscrepancy > 0 ? "#f0fdf4" : "#fef2f2",
                borderRadius: "8px",
                marginTop: "10px",
                fontSize: "14px",
              }}
            >
              <span>Cash Pouch Variance:</span>
              <strong style={{ color: cashDiscrepancy === 0 ? "#15803d" : cashDiscrepancy > 0 ? "#15803d" : "#b91c1c" }}>
                {cashDiscrepancy === 0 ? "Balanced ✓ ($0.00)" : `${cashDiscrepancy > 0 ? "+" : ""}${formatMoney(cashDiscrepancy)}`}
              </strong>
            </div>
          </div>

          {/* Final Odometer Reading */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>End-of-Shift Final Odometer (km)</label>
            <input
              type="number"
              value={finalOdometer}
              onChange={(e) => setFinalOdometer(e.target.value)}
              className={styles.textInput}
            />
          </div>

          {/* Notes */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Driver Shift Notes</label>
            <textarea
              value={cashNotes}
              onChange={(e) => setCashNotes(e.target.value)}
              placeholder="e.g. All consignments delivered, vehicle refueled and parked in Bay 4."
              rows={2}
              className={styles.textArea}
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmCloseout}
              disabled={submitting}
              className={styles.buttonPrimary}
              style={{ flex: 2 }}
            >
              <CheckCircle2 size={17} />
              <span>{submitting ? "Closing Out..." : "Complete Driver Closeout"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
