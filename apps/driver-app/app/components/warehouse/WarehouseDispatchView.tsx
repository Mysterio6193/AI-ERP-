"use client"

import { useMemo, useState } from "react"
import {
  Boxes,
  CheckCircle2,
  Layers,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  Search,
  Send,
  Truck,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { ShippingLabelModal } from "./ShippingLabelModal"
import { PalletBuilderModal } from "./PalletBuilderModal"
import { PalletData } from "./SSCCPalletLabelModal"
import { ThirdPartyLogisticsModal } from "./ThirdPartyLogisticsModal"
import styles from "../../page.module.css"

export interface DispatchOrder {
  id: string
  orderNumber: string
  customerName: string
  deliveryAddress: string
  status: string
  itemsCount: number
  totalCartons: number
  totalWeight: number
  carrierName?: string | null
  consignmentNumber?: string | null
  assignedDriverName?: string | null
  routeNumber?: string | null
  requiredDate?: string | null
}

interface WarehouseDispatchViewProps {
  orders: DispatchOrder[]
  loading: boolean
  onRefresh: () => void
  onDispatchOrder: (orderId: string, payload: Record<string, unknown>) => Promise<void>
}

const CARRIERS = [
  "Internal Fleet Driver",
  "StarTrack Express",
  "Australia Post eParcel",
  "TNT / FedEx Express",
  "Direct Freight Express",
  "Mainfreight Logistics",
  "Toll Transport",
  "Border Express",
  "Customer Pickup",
]

export function WarehouseDispatchView({
  orders,
  loading,
  onRefresh,
  onDispatchOrder,
}: WarehouseDispatchViewProps) {
  const [search, setSearch] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<DispatchOrder | null>(null)
  const [labelOrder, setLabelOrder] = useState<DispatchOrder | null>(null)
  const [palletModalOpen, setPalletModalOpen] = useState(false)
  const [logisticsModalOpen, setLogisticsModalOpen] = useState(false)
  const [carrier, setCarrier] = useState(CARRIERS[0])
  const [consignmentNo, setConsignmentNo] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return orders

    return orders.filter((order) => {
      return (
        order.orderNumber.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.deliveryAddress.toLowerCase().includes(q) ||
        Boolean(order.carrierName && order.carrierName.toLowerCase().includes(q)) ||
        Boolean(order.consignmentNumber && order.consignmentNumber.toLowerCase().includes(q)) ||
        Boolean(order.assignedDriverName && order.assignedDriverName.toLowerCase().includes(q))
      )
    })
  }, [orders, search])

  function openDispatchModal(order: DispatchOrder) {
    setSelectedOrder(order)
    setCarrier(order.carrierName || CARRIERS[0])
    setConsignmentNo(
      order.consignmentNumber ||
        `CON-${new Date().getFullYear()}${Math.floor(100000 + Math.random() * 900000)}`
    )
    setError(null)
  }

  async function handleConfirmDispatch() {
    if (!selectedOrder) return

    try {
      setSubmitting(true)
      setError(null)

      await onDispatchOrder(selectedOrder.id, {
        status: "dispatched",
        carrierName: carrier,
        consignmentNumber: consignmentNo.trim() || undefined,
        dispatchedAt: new Date().toISOString(),
      })

      audioFeedback.playSuccessChime()
      setSuccessMsg(`✓ Order #${selectedOrder.orderNumber} handed over to ${carrier}!`)
      setSelectedOrder(null)
      onRefresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to record dispatch")
      audioFeedback.playErrorBuzz()
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePalletComplete(pallet: PalletData) {
    const targetOrder = selectedOrder || orders[0]
    if (targetOrder) {
      try {
        await onDispatchOrder(targetOrder.id, {
          status: "packed",
          carrierName: "3PL Pallet Freight",
          consignmentNumber: pallet.sscc,
          notes: `Full Pallet ${pallet.palletNumber} (${pallet.palletType}) staged at Bay Dock. Batch: ${pallet.batchCode}`,
        })
      } catch (err) {
        console.warn("Pallet stage sync warning:", err)
      }
    }
    audioFeedback.playSuccessChime()
    setSuccessMsg(
      `✓ Outbound Pallet ${pallet.palletNumber} staged at Bay Dock (${pallet.totalCartons} Cartons, SSCC: ${pallet.sscc})!`
    )
    onRefresh()
  }

  async function handle3PLManifestDispatched(manifest: Record<string, unknown>) {
    const stagedCount = orders.length
    for (const order of orders) {
      try {
        await onDispatchOrder(order.id, {
          status: "dispatched",
          carrierName: (manifest.carrierName as string) || "3PL Linehaul Carrier",
          consignmentNumber: (manifest.manifestNumber as string) || `CON-${Date.now().toString().slice(-6)}`,
          dispatchedAt: (manifest.dispatchedAt as string) || new Date().toISOString(),
        })
      } catch (err) {
        console.warn("Order dispatch sync warning:", err)
      }
    }
    audioFeedback.playSuccessChime()
    setSuccessMsg(
      `✓ 3PL Manifest ${manifest.manifestNumber} dispatched to ${manifest.carrierName}! (${stagedCount} order${stagedCount === 1 ? "" : "s"} handed over)`
    )
    onRefresh()
  }

  const totalCartons = orders.reduce((sum, o) => sum + (o.totalCartons || 1), 0)
  const totalWeight = orders.reduce((sum, o) => sum + (o.totalWeight || 0), 0)
  const estimatedPallets = Math.ceil(totalCartons / 30) // ~30 cartons/pallet avg

  return (
    <div className={styles.mainContent}>
      {/* Apple Hero Tile Alternate: Dark Tile */}
      <section className={styles.heroDarkTile}>
        <div className={styles.heroHeaderStack}>
          <span className={styles.heroTagline}>Dock Outflow & 3PL Freight</span>
          <h1 className={styles.heroDisplay}>Dispatch, Palletizing & 3PL Hub</h1>
          <p className={styles.heroLead}>
            {orders.length} Staged orders ready for pallet consolidation, fleet routing, or 3PL linehaul
          </p>
        </div>

        {/* Apple Stat Strip */}
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Staged Orders</span>
            <span className={styles.statValue}>{orders.length}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Cartons</span>
            <span className={styles.statValue} style={{ color: "var(--primary-on-dark)" }}>
              {totalCartons}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Estimated Pallets</span>
            <span className={styles.statValue}>{estimatedPallets}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Gross Wt (kg)</span>
            <span className={styles.statValue}>{totalWeight}</span>
          </div>
        </div>

        {/* Action Controls for 3PL Freight & Palletizing */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setLogisticsModalOpen(true)}
              className={styles.buttonPrimary}
              style={{ padding: "8px 18px", fontSize: "14px" }}
            >
              <Truck size={15} />
              <span>3PL Carrier Dispatch</span>
            </button>

            <button
              type="button"
              onClick={() => setPalletModalOpen(true)}
              className={styles.buttonPearlCapsule}
              style={{ padding: "8px 16px", fontSize: "14px" }}
            >
              <Boxes size={15} />
              <span>Build Outbound Pallet (SSCC)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className={styles.buttonDarkUtility}
          >
            <RefreshCw size={14} className={loading ? styles.spin : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </section>

      {successMsg && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--canvas)",
            border: "1px solid #10b981",
            borderRadius: "11px",
            color: "#047857",
            fontSize: "14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{successMsg}</span>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            style={{ background: "none", border: "none", color: "var(--ink-muted-48)", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className={styles.searchContainer}>
        <Search size={18} className={styles.searchIcon} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search staged orders by order #, customer, address..."
          className={styles.searchInput}
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className={styles.clearSearchBtn}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Store Utility Card Grid */}
      <div className={styles.cardGrid}>
        {filteredOrders.length === 0 ? (
          <div className={styles.utilityCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
            <p style={{ margin: 0, color: "var(--ink-muted-48)" }}>No packed orders currently waiting for dispatch.</p>
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className={styles.utilityCard}>
              <div className={styles.cardHeaderRow}>
                <span className={styles.cardSequenceBadge}>Order #{order.orderNumber}</span>
                <span className={styles.cardTagHighlight}>Packed & Staged</span>
              </div>

              <div>
                <h3 className={styles.cardTitle}>{order.customerName}</h3>
                <p className={styles.cardSub}>
                  {order.requiredDate ? `Required: ${new Date(order.requiredDate).toLocaleDateString()}` : "Ready for Transport"}
                </p>
              </div>

              <div className={styles.cardAddress}>
                <MapPin size={16} style={{ flexShrink: 0, marginTop: "2px", color: "var(--ink-muted-48)" }} />
                <span>{order.deliveryAddress || "Warehouse Local Pickup"}</span>
              </div>

              <div className={styles.cardMetadataRow}>
                <span className={styles.cardTag}>
                  <Package size={13} /> {order.totalCartons || 1} Cartons
                </span>
                {order.totalWeight > 0 && (
                  <span className={styles.cardTag}>
                    <Layers size={13} /> {order.totalWeight} kg
                  </span>
                )}
                {order.assignedDriverName && (
                  <span className={styles.cardTagHighlight}>
                    <Truck size={13} /> Driver: {order.assignedDriverName}
                  </span>
                )}
                {order.carrierName && (
                  <span className={styles.cardTag}>
                    3PL: {order.carrierName}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", gap: "8px", marginTop: "8px", paddingTop: "12px", borderTop: "1px solid var(--hairline)" }}>
                <button
                  type="button"
                  onClick={() => setLabelOrder(order)}
                  className={styles.buttonPearlCapsule}
                  title="Print 4x6 Thermal Shipping Label"
                >
                  <Printer size={14} />
                  <span>4×6″ Label</span>
                </button>

                <button
                  type="button"
                  onClick={() => openDispatchModal(order)}
                  className={styles.buttonPrimary}
                  style={{ marginLeft: "auto", padding: "8px 18px", fontSize: "14px" }}
                >
                  <Send size={15} />
                  <span>Release</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Dispatch Handover Modal */}
      {selectedOrder && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.cardSequenceBadge}>Order #{selectedOrder.orderNumber}</span>
                <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
                  {selectedOrder.customerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className={styles.buttonIconCircular}
                style={{ width: "32px", height: "32px" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {error && (
                <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "14px" }}>
                  {error}
                </div>
              )}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Dispatch Carrier / 3PL Partner</label>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className={styles.selectInput}
                >
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Consignment / Tracking Number</label>
                <input
                  type="text"
                  value={consignmentNo}
                  onChange={(e) => setConsignmentNo(e.target.value)}
                  placeholder="CON-XXXXXXX"
                  className={styles.textInput}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className={styles.buttonSecondaryPill}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDispatch}
                  disabled={submitting}
                  className={styles.buttonPrimary}
                  style={{ flex: 2 }}
                >
                  <CheckCircle2 size={17} />
                  <span>{submitting ? "Handing Over..." : "Confirm Handover"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4x6 Thermal Shipping Label Modal */}
      {labelOrder && (
        <ShippingLabelModal
          isOpen={Boolean(labelOrder)}
          onClose={() => setLabelOrder(null)}
          order={labelOrder}
        />
      )}

      {/* Outbound Pallet Consolidation Modal */}
      <PalletBuilderModal
        isOpen={palletModalOpen}
        onClose={() => setPalletModalOpen(false)}
        mode="outbound"
        defaultProductOrCustomer={orders[0]?.customerName || "Staged Orders Pallet"}
        defaultOrderNo={orders[0]?.orderNumber || "MULTI-ORDER"}
        onComplete={handlePalletComplete}
      />

      {/* 3PL Logistics Dispatch & Manifest Modal */}
      <ThirdPartyLogisticsModal
        isOpen={logisticsModalOpen}
        onClose={() => setLogisticsModalOpen(false)}
        stagedOrders={orders}
        onDispatchManifest={handle3PLManifestDispatched}
      />
    </div>
  )
}
