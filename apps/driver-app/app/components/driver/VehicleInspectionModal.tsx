"use client"

import { useState } from "react"
import {
  Check,
  CheckCircle2,
  Gauge,
  ShieldCheck,
  Thermometer,
  Truck,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import styles from "../../page.module.css"

interface VehicleInspectionModalProps {
  isOpen: boolean
  onClose: () => void
  vehicleId: string
  driverName: string
  onComplete: (dvir: Record<string, unknown>) => void
}

export function VehicleInspectionModal({
  isOpen,
  onClose,
  vehicleId,
  driverName,
  onComplete,
}: VehicleInspectionModalProps) {
  const [inspectionType, setInspectionType] = useState<"pre_trip" | "post_trip">("pre_trip")
  const [odometer, setOdometer] = useState("142850")
  const [freezerTemp, setFreezerTemp] = useState("-18.5")
  const [chillerTemp, setChillerTemp] = useState("2.4")
  const [fuelLevel, setFuelLevel] = useState("85")

  // Checklist items
  const [checks, setChecks] = useState({
    tyres: true,
    brakes: true,
    lights: true,
    mirrors: true,
    wipers: true,
    refrigerationUnit: true,
    cargoRestraints: true,
    firstAidKit: true,
  })

  const [notes, setNotes] = useState("")
  const [signed, setSigned] = useState(false)

  if (!isOpen) return null

  function toggleCheck(key: keyof typeof checks) {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSave() {
    const isTempSafe = Number(freezerTemp) <= -15 && Number(chillerTemp) <= 4

    const payload = {
      type: inspectionType,
      vehicleId,
      driverName,
      odometer: Number(odometer),
      freezerTemp: Number(freezerTemp),
      chillerTemp: Number(chillerTemp),
      isTempSafe,
      fuelLevel: Number(fuelLevel),
      checks,
      notes,
      timestamp: new Date().toISOString(),
    }

    audioFeedback.playSuccessChime()
    onComplete(payload)
    onClose()
  }

  const allPassed = Object.values(checks).every(Boolean)

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxWidth: "560px" }}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.heroTaglineLight}>Fleet Safety Compliance</span>
            <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
              Vehicle Inspection (DVIR)
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
          {/* Type Toggle */}
          <div className={styles.pillGroup}>
            <button
              type="button"
              onClick={() => setInspectionType("pre_trip")}
              className={inspectionType === "pre_trip" ? styles.optionChipSelected : styles.optionChip}
            >
              Pre-Trip Inspection
            </button>
            <button
              type="button"
              onClick={() => setInspectionType("post_trip")}
              className={inspectionType === "post_trip" ? styles.optionChipSelected : styles.optionChip}
            >
              Post-Trip Inspection
            </button>
          </div>

          {/* Cold Chain Temperature Readings */}
          <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Thermometer size={18} style={{ color: "var(--primary)" }} />
              <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>Cold Chain Compliance</h4>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "12px" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Freezer Temp (°C) [≤ -15°C]</label>
                <input
                  type="text"
                  value={freezerTemp}
                  onChange={(e) => setFreezerTemp(e.target.value)}
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Chiller Temp (°C) [0 to 4°C]</label>
                <input
                  type="text"
                  value={chillerTemp}
                  onChange={(e) => setChillerTemp(e.target.value)}
                  className={styles.textInput}
                />
              </div>
            </div>
          </div>

          {/* Odometer & Fuel */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Odometer (km)</label>
              <input
                type="number"
                value={odometer}
                onChange={(e) => setOdometer(e.target.value)}
                className={styles.textInput}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Fuel Level (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={fuelLevel}
                onChange={(e) => setFuelLevel(e.target.value)}
                className={styles.textInput}
              />
            </div>
          </div>

          {/* Vehicle Checkpoints Grid */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Safety & Mechanical Inspection</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              {Object.entries({
                tyres: "Tyres & Pressure",
                brakes: "Foot & Hand Brakes",
                lights: "Headlights & Signals",
                mirrors: "Mirrors & Windshield",
                wipers: "Wipers & Washers",
                refrigerationUnit: "ThermoKing Unit OK",
                cargoRestraints: "Cargo Straps & Bars",
                firstAidKit: "First Aid & Fire Ext",
              }).map(([key, label]) => {
                const passed = checks[key as keyof typeof checks]
                return (
                  <div
                    key={key}
                    onClick={() => toggleCheck(key as keyof typeof checks)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: passed ? "var(--canvas)" : "#fef2f2",
                      border: passed ? "1px solid var(--hairline)" : "1px solid #fecaca",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: "14px",
                    }}
                  >
                    <span>{label}</span>
                    <span
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: passed ? "#15803d" : "#b91c1c",
                      }}
                    >
                      {passed ? "Pass ✓" : "Defect ✗"}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Inspection Notes / Minor Defects</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Vehicle washed, tyres inspected, all cargo straps tensioned."
              rows={2}
              className={styles.textArea}
            />
          </div>

          {/* Driver Declaration Checkbox */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "12px",
              background: "var(--canvas-parchment)",
              borderRadius: "11px",
            }}
          >
            <input
              type="checkbox"
              id="signOff"
              checked={signed}
              onChange={(e) => setSigned(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--primary)", cursor: "pointer" }}
            />
            <label htmlFor="signOff" style={{ fontSize: "13px", color: "var(--ink)", cursor: "pointer" }}>
              I, <strong>{driverName}</strong>, certify that this vehicle has been inspected and is roadworthy
              and food-safe.
            </label>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
            <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!signed}
              className={styles.buttonPrimary}
              style={{ flex: 2 }}
            >
              <ShieldCheck size={17} />
              <span>Submit & Log Inspection</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
