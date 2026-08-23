"use client"

import { useState } from "react"
import {
  Boxes,
  Check,
  CheckCircle2,
  FileText,
  Layers,
  Package,
  Printer,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { SignaturePad } from "../ui/SignaturePad"
import styles from "../../page.module.css"

export interface LogisticsCarrier {
  id: string
  name: string
  services: string[]
  accountNumber: string
  palletExchangeSupported: boolean
}

export const THIRD_PARTY_CARRIERS: LogisticsCarrier[] = [
  {
    id: "startrack",
    name: "StarTrack Express",
    services: ["Road Express", "Premium Overnight Air", "Next Flight"],
    accountNumber: "ST-8842109",
    palletExchangeSupported: true,
  },
  {
    id: "mainfreight",
    name: "Mainfreight Logistics",
    services: ["LTL Pallet Freight", "Full Truckload (FTL)", "Temperature Controlled Reefer"],
    accountNumber: "MF-492019",
    palletExchangeSupported: true,
  },
  {
    id: "tnt_fedex",
    name: "TNT / FedEx Express",
    services: ["Express 9:00", "Express Road", "Heavy Freight Direct"],
    accountNumber: "TNT-093128",
    palletExchangeSupported: true,
  },
  {
    id: "direct_freight",
    name: "Direct Freight Express",
    services: ["Priority Road", "B2B Palletized"],
    accountNumber: "DFE-77218",
    palletExchangeSupported: true,
  },
  {
    id: "auspost",
    name: "Australia Post eParcel",
    services: ["Regular Parcel", "Express Post"],
    accountNumber: "AP-392011",
    palletExchangeSupported: false,
  },
  {
    id: "toll",
    name: "Toll Transport",
    services: ["Interstate Linehaul", "B2B Metro"],
    accountNumber: "TOLL-55209",
    palletExchangeSupported: true,
  },
  {
    id: "border_express",
    name: "Border Express",
    services: ["Road Distribution", "Pallet Express"],
    accountNumber: "BX-99412",
    palletExchangeSupported: true,
  },
]

interface ThirdPartyLogisticsModalProps {
  isOpen: boolean
  onClose: () => void
  stagedOrders: Array<{
    id: string
    orderNumber: string
    customerName: string
    deliveryAddress: string
    totalCartons: number
    totalWeight: number
  }>
  onDispatchManifest: (manifest: Record<string, unknown>) => void
}

export function ThirdPartyLogisticsModal({
  isOpen,
  onClose,
  stagedOrders,
  onDispatchManifest,
}: ThirdPartyLogisticsModalProps) {
  const [selectedCarrier, setSelectedCarrier] = useState<LogisticsCarrier>(THIRD_PARTY_CARRIERS[0])
  const [serviceLevel, setServiceLevel] = useState<string>(THIRD_PARTY_CARRIERS[0].services[0])
  const [palletsCount, setPalletsCount] = useState<number>(2)
  const [looseCartonsCount, setLooseCartonsCount] = useState<number>(
    stagedOrders.reduce((sum, o) => sum + (o.totalCartons || 1), 0)
  )
  const [chepExchangeCount, setChepExchangeCount] = useState<number>(2)
  const [cubicMeters, setCubicMeters] = useState<string>("2.8")

  // Driver details
  const [driverName, setDriverName] = useState("")
  const [truckRego, setTruckRego] = useState("")
  const [driverSignature, setDriverSignature] = useState("")
  const [manifestPrintMode, setManifestPrintMode] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  if (!isOpen) return null

  const totalDeadWeight = stagedOrders.reduce((sum, o) => sum + (o.totalWeight || 15), 0)
  const volumetricCubicWeight = Math.round(Number(cubicMeters) * 250) // 250 kg/m3 standard road cubic factor
  const chargeableWeight = Math.max(totalDeadWeight, volumetricCubicWeight)

  const manifestNumber = `3PL-${selectedCarrier.id.toUpperCase()}-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`

  function handleCarrierChange(carrierId: string) {
    const matched = THIRD_PARTY_CARRIERS.find((c) => c.id === carrierId) || THIRD_PARTY_CARRIERS[0]
    setSelectedCarrier(matched)
    setServiceLevel(matched.services[0])
  }

  function handleCompleteManifest() {
    const payload = {
      manifestNumber,
      carrierId: selectedCarrier.id,
      carrierName: selectedCarrier.name,
      serviceLevel,
      accountNumber: selectedCarrier.accountNumber,
      palletsCount,
      looseCartonsCount,
      chepExchangeCount,
      cubicMeters: Number(cubicMeters),
      deadWeightKg: totalDeadWeight,
      chargeableWeightKg: chargeableWeight,
      ordersCount: stagedOrders.length,
      driverName: driverName.trim() || "3PL Linehaul Driver",
      truckRego: truckRego.trim() || "Fleet Transport",
      driverSignature,
      dispatchedAt: new Date().toISOString(),
    }

    audioFeedback.playSuccessChime()
    onDispatchManifest(payload)
    setManifestPrintMode(true)
  }

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent} style={{ maxWidth: "620px" }}>
        <div className={styles.modalHeader}>
          <div>
            <span className={styles.heroTaglineLight}>Carrier Freight Outflow</span>
            <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
              {manifestPrintMode ? "Official 3PL Collection Manifest" : "3PL Carrier Dispatch & Handover"}
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
          {manifestPrintMode ? (
            /* Printable Official 3PL Collection Manifest */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div
                style={{
                  background: "#ffffff",
                  border: "2px solid #000000",
                  padding: "20px",
                  fontFamily: "'Courier New', Courier, monospace",
                  color: "#000000",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "2px solid #000", paddingBottom: "10px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "16px", textTransform: "uppercase" }}>
                      {selectedCarrier.name}
                    </h3>
                    <p style={{ margin: 0, fontSize: "12px" }}>ELECTRONIC FREIGHT MANIFEST</p>
                    <p style={{ margin: 0, fontSize: "11px" }}>Account: {selectedCarrier.accountNumber}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "14px", fontWeight: "bold" }}>{manifestNumber}</span>
                    <p style={{ margin: 0, fontSize: "11px" }}>{new Date().toLocaleString()}</p>
                  </div>
                </div>

                {/* Freight Consignment Matrix */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px", padding: "12px 0", borderBottom: "1px solid #000", textAlign: "center" }}>
                  <div>
                    <span style={{ fontSize: "10px" }}>PALLETS</span>
                    <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>{palletsCount}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: "10px" }}>CARTONS</span>
                    <p style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>{looseCartonsCount}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: "10px" }}>VOLUME</span>
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold" }}>{cubicMeters} m³</p>
                  </div>
                  <div>
                    <span style={{ fontSize: "10px" }}>BILLABLE WT</span>
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: "bold" }}>{chargeableWeight} KG</p>
                  </div>
                </div>

                {/* Orders Consignment Table */}
                <div style={{ padding: "10px 0", borderBottom: "1px solid #000" }}>
                  <span style={{ fontSize: "11px", fontWeight: "bold" }}>STAGED CONSIGNMENTS ({stagedOrders.length})</span>
                  <div style={{ marginTop: "6px", display: "flex", flexDirection: "column", gap: "4px" }}>
                    {stagedOrders.map((o) => (
                      <div key={o.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
                        <span>Order #{o.orderNumber} • {o.customerName}</span>
                        <span>{o.totalCartons || 1} ctns ({o.totalWeight || 12} kg)</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Driver Sign-off Footer */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", paddingTop: "12px" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: "11px" }}><strong>DRIVER:</strong> {driverName || "Driver Verified"}</p>
                    <p style={{ margin: 0, fontSize: "11px" }}><strong>VEHICLE REGO:</strong> {truckRego || "Interstate Fleet"}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: "10px" }}>CARRIER SIGNATURE ON GLASS</span>
                    {driverSignature && (
                      <img src={driverSignature} alt="Driver Sign" style={{ maxHeight: "40px", display: "block", marginLeft: "auto" }} />
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
                  Done
                </button>
                <button
                  type="button"
                  onClick={() => {
                    audioFeedback.playSuccessChime()
                    window.print()
                  }}
                  className={styles.buttonPrimary}
                  style={{ flex: 2 }}
                >
                  <Printer size={16} />
                  <span>Print Carrier Manifest</span>
                </button>
              </div>
            </div>
          ) : (
            /* Manifest Creation & 3PL Driver Handover */
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {/* Carrier Selector */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Third-Party Logistics (3PL) Partner</label>
                <select
                  value={selectedCarrier.id}
                  onChange={(e) => handleCarrierChange(e.target.value)}
                  className={styles.selectInput}
                >
                  {THIRD_PARTY_CARRIERS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.accountNumber})
                    </option>
                  ))}
                </select>
              </div>

              {/* Service Level */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Carrier Service Level</label>
                <div className={styles.pillGroup}>
                  {selectedCarrier.services.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setServiceLevel(s)}
                      className={serviceLevel === s ? styles.optionChipSelected : styles.optionChip}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pallet vs Loose Box Counts & CHEP Transfer */}
              <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Full Pallets</label>
                    <input
                      type="number"
                      min={0}
                      value={palletsCount}
                      onChange={(e) => setPalletsCount(Number(e.target.value) || 0)}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Loose Cartons</label>
                    <input
                      type="number"
                      min={0}
                      value={looseCartonsCount}
                      onChange={(e) => setLooseCartonsCount(Number(e.target.value) || 0)}
                      className={styles.textInput}
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Volume (m³)</label>
                    <input
                      type="text"
                      value={cubicMeters}
                      onChange={(e) => setCubicMeters(e.target.value)}
                      className={styles.textInput}
                    />
                  </div>
                </div>

                {selectedCarrier.palletExchangeSupported && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", paddingTop: "10px", borderTop: "1px solid var(--hairline)" }}>
                    <div>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                        CHEP / LOSCAM Pallet Exchange
                      </span>
                      <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted-48)" }}>
                        Account docket transfer on pickup
                      </p>
                    </div>
                    <span className={styles.cardTagHighlight}>
                      {palletsCount} CHEP Wooden Pallets
                    </span>
                  </div>
                )}
              </div>

              {/* 3PL Driver Collection Details */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>3PL Driver Name *</label>
                  <input
                    type="text"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    placeholder="e.g. Jason Miller"
                    className={styles.textInput}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Truck / Trailer Registration *</label>
                  <input
                    type="text"
                    value={truckRego}
                    onChange={(e) => setTruckRego(e.target.value)}
                    placeholder="e.g. NSW TRK-882"
                    className={styles.textInput}
                  />
                </div>
              </div>

              {/* Driver Signature Pad */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>3PL Driver Signature (Handover Acceptance)</label>
                <SignaturePad
                  initialValue={driverSignature}
                  onSave={(dataUrl) => setDriverSignature(dataUrl)}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCompleteManifest}
                  disabled={submitting || !driverName.trim()}
                  className={styles.buttonPrimary}
                  style={{ flex: 2 }}
                >
                  <Truck size={17} />
                  <span>Release to {selectedCarrier.name}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
