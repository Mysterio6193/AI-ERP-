"use client"

import { useState } from "react"
import {
  ArrowRight,
  Boxes,
  Check,
  CheckCircle2,
  Layers,
  Package,
  Plus,
  Printer,
  QrCode,
  Scale,
  ShieldCheck,
  Snowflake,
  Trash2,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { ShippingLabelModal } from "./ShippingLabelModal"
import styles from "../../page.module.css"

export interface PackItem {
  id: string
  productId: string
  productName: string
  sku: string
  pickedQty: number
  packedQty: number
  baseUnit: string
}

export interface CartonData {
  id: string
  cartonNumber: number
  boxType: "Small Box (250×200×150)" | "Medium Carton (400×300×250)" | "Large HD (600×400×400)" | "Insulated Cold Box (Chilled)" | "Full Pallet"
  weightKg: number
  items: Array<{ productId: string; productName: string; sku: string; qty: number }>
  sealed: boolean
}

interface CartonPackingStationModalProps {
  isOpen: boolean
  onClose: () => void
  order: {
    id: string
    orderNumber: string
    customerName: string
    deliveryAddress: string
    items: Array<{
      id: string
      productId: string
      productName: string
      sku: string
      pickedQty: number
      baseUnit?: string
    }>
  }
  onCompletePacking: (packPayload: {
    orderId: string
    totalCartons: number
    totalWeight: number
    cartons: CartonData[]
  }) => Promise<void>
}

const BOX_TYPES = [
  "Medium Carton (400×300×250)",
  "Small Box (250×200×150)",
  "Large HD (600×400×400)",
  "Insulated Cold Box (Chilled)",
  "Full Pallet",
] as const

export function CartonPackingStationModal({
  isOpen,
  onClose,
  order,
  onCompletePacking,
}: CartonPackingStationModalProps) {
  const [cartons, setCartons] = useState<CartonData[]>([
    {
      id: "carton_1",
      cartonNumber: 1,
      boxType: "Medium Carton (400×300×250)",
      weightKg: 8.5,
      items: [],
      sealed: false,
    },
  ])
  const [activeCartonIndex, setActiveCartonIndex] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [labelModalOrder, setLabelModalOrder] = useState<any | null>(null)

  if (!isOpen) return null

  const activeCarton = cartons[activeCartonIndex] || cartons[0]

  // Track remaining unpacked items
  const unpackedItems = order.items.map((item) => {
    const totalPackedAcrossCartons = cartons.reduce((sum, c) => {
      const match = c.items.find((it) => it.productId === item.productId)
      return sum + (match?.qty || 0)
    }, 0)

    const remainingToPack = Math.max(0, item.pickedQty - totalPackedAcrossCartons)
    return {
      ...item,
      remainingToPack,
      totalPacked: totalPackedAcrossCartons,
    }
  })

  function handleAddItemToCarton(item: typeof unpackedItems[0], qtyToPack: number) {
    if (qtyToPack <= 0) return
    const actualQty = Math.min(qtyToPack, item.remainingToPack)
    if (actualQty <= 0) return

    setCartons((prev) => {
      const updated = [...prev]
      const current = { ...updated[activeCartonIndex] }
      const existingItemIndex = current.items.findIndex((it) => it.productId === item.productId)

      if (existingItemIndex >= 0) {
        const itemCopy = { ...current.items[existingItemIndex] }
        itemCopy.qty += actualQty
        current.items[existingItemIndex] = itemCopy
      } else {
        current.items.push({
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          qty: actualQty,
        })
      }

      current.weightKg = Math.round((current.weightKg + actualQty * 1.2) * 10) / 10
      updated[activeCartonIndex] = current
      return updated
    })

    audioFeedback.playPickBeep()
  }

  function handleAddNewCarton() {
    const nextNum = cartons.length + 1
    setCartons((prev) => [
      ...prev,
      {
        id: `carton_${nextNum}`,
        cartonNumber: nextNum,
        boxType: "Medium Carton (400×300×250)",
        weightKg: 2.0,
        items: [],
        sealed: false,
      },
    ])
    setActiveCartonIndex(cartons.length)
    audioFeedback.playSuccessChime()
  }

  function handleSealCarton(cartonIndex: number) {
    setCartons((prev) => {
      const updated = [...prev]
      updated[cartonIndex] = { ...updated[cartonIndex], sealed: true }
      return updated
    })
    audioFeedback.playSuccessChime()
  }

  const allItemsPacked = unpackedItems.every((it) => it.remainingToPack === 0)
  const totalGrossWeight = cartons.reduce((sum, c) => sum + c.weightKg, 0)

  async function handleFinishAndSealOrder() {
    try {
      setSaving(true)
      await onCompletePacking({
        orderId: order.id,
        totalCartons: cartons.length,
        totalWeight: totalGrossWeight,
        cartons,
      })

      audioFeedback.playSuccessChime()
      setLabelModalOrder({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        deliveryAddress: order.deliveryAddress,
        totalCartons: cartons.length,
        totalWeight: totalGrossWeight,
        carrierName: "Direct Freight / Courier Express",
      })
    } catch (err) {
      console.error(err)
      audioFeedback.playErrorBuzz()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className={styles.modalOverlay}>
        <div className={styles.modalContent} style={{ maxWidth: "680px" }}>
          <div className={styles.modalHeader}>
            <div>
              <span className={styles.heroTaglineLight}>Order Cartonization</span>
              <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
                Packing Station — #{order.orderNumber}
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
            {/* Customer & Consignment Banner */}
            <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "14px 18px" }}>
              <div className={styles.cardHeaderRow}>
                <div>
                  <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>{order.customerName}</h4>
                  <p style={{ margin: "2px 0 0 0", fontSize: "13px", color: "var(--ink-muted-80)" }}>
                    {order.deliveryAddress}
                  </p>
                </div>
                <span className={allItemsPacked ? styles.cardTagHighlight : styles.cardTag}>
                  {allItemsPacked ? "100% Packed ✓" : "Packing In Progress"}
                </span>
              </div>
            </div>

            {/* Carton Selector Bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className={styles.pillGroup}>
                {cartons.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveCartonIndex(idx)}
                    className={activeCartonIndex === idx ? styles.optionChipSelected : styles.optionChip}
                  >
                    <Package size={13} style={{ display: "inline", marginRight: "4px" }} />
                    Carton #{c.cartonNumber} ({c.items.reduce((s, it) => s + it.qty, 0)} pkgs)
                    {c.sealed && " ✓"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddNewCarton}
                className={styles.buttonPearlCapsule}
                style={{ padding: "6px 12px", fontSize: "13px" }}
              >
                <Plus size={14} />
                <span>Add Box</span>
              </button>
            </div>

            {/* Active Carton Detail & Weight */}
            <div className={styles.utilityCard} style={{ padding: "16px" }}>
              <div className={styles.cardHeaderRow}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Package size={18} style={{ color: "var(--primary)" }} />
                  <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
                    Configuring Carton #{activeCarton.cartonNumber}
                  </h4>
                </div>

                <span className={styles.cardTagHighlight}>
                  {activeCarton.items.reduce((s, it) => s + it.qty, 0)} Units Packed
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "10px", marginTop: "12px" }}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Packaging / Box Type</label>
                  <select
                    value={activeCarton.boxType}
                    onChange={(e) => {
                      const val = e.target.value as any
                      setCartons((prev) => {
                        const updated = [...prev]
                        updated[activeCartonIndex] = { ...updated[activeCartonIndex], boxType: val }
                        return updated
                      })
                    }}
                    className={styles.selectInput}
                  >
                    {BOX_TYPES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Gross Weight (kg)</label>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={activeCarton.weightKg}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0.1
                        setCartons((prev) => {
                          const updated = [...prev]
                          updated[activeCartonIndex] = { ...updated[activeCartonIndex], weightKg: val }
                          return updated
                        })
                      }}
                      className={styles.textInput}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        audioFeedback.playPickBeep()
                      }}
                      className={styles.buttonPearlCapsule}
                      title="Read from Bluetooth Scale"
                      style={{ padding: "12px 14px" }}
                    >
                      <Scale size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Line Items Available for Packing */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Picked Items to Place in Carton #{activeCarton.cartonNumber}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {unpackedItems.map((item) => {
                  const isDone = item.remainingToPack === 0
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "10px 14px",
                        background: isDone ? "var(--surface-pearl)" : "var(--canvas)",
                        border: "1px solid var(--hairline)",
                        borderRadius: "11px",
                      }}
                    >
                      <div>
                        <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>
                          {item.productName}
                        </span>
                        <span style={{ display: "block", fontSize: "12px", color: "var(--ink-muted-48)" }}>
                          SKU: {item.sku} • Total Picked: {item.pickedQty} {item.baseUnit || "units"}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: isDone ? "#15803d" : "var(--primary)",
                          }}
                        >
                          {isDone ? "All Packed ✓" : `${item.remainingToPack} Left`}
                        </span>

                        {!isDone && (
                          <div style={{ display: "flex", gap: "4px" }}>
                            <button
                              type="button"
                              onClick={() => handleAddItemToCarton(item, 1)}
                              className={styles.buttonPearlCapsule}
                              style={{ padding: "6px 10px", fontSize: "12px" }}
                            >
                              +1
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddItemToCarton(item, item.remainingToPack)}
                              className={styles.buttonPrimary}
                              style={{ padding: "6px 12px", fontSize: "12px" }}
                            >
                              Pack All
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Total Packing Summary & Final Action */}
            <div style={{ display: "flex", gap: "10px", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--hairline)" }}>
              <button type="button" onClick={onClose} className={styles.buttonSecondaryPill} style={{ flex: 1 }}>
                Close
              </button>
              <button
                type="button"
                onClick={handleFinishAndSealOrder}
                disabled={saving || !allItemsPacked}
                className={styles.buttonPrimary}
                style={{ flex: 2 }}
              >
                <CheckCircle2 size={17} />
                <span>{saving ? "Sealing Order..." : `Seal & Print Labels (${cartons.length} Boxes)`}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4x6 Thermal Shipping Label Generator Modal */}
      {labelModalOrder && (
        <ShippingLabelModal
          isOpen={Boolean(labelModalOrder)}
          onClose={() => {
            setLabelModalOrder(null)
            onClose()
          }}
          order={labelModalOrder}
        />
      )}
    </>
  )
}
