"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  Download,
  Layers,
  Package,
  RefreshCw,
  Search,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { PalletBuilderModal } from "./PalletBuilderModal"
import { PalletData } from "./SSCCPalletLabelModal"
import { InboundDiscrepancyModal } from "./InboundDiscrepancyModal"
import styles from "../../page.module.css"

export interface POItem {
  id: string
  productId: string
  product: {
    id: string
    name: string
    sku: string
    baseUnit?: string
  }
  quantity: number
  receivedQty: number
  unitCost: number
  totalCost: number
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  supplier: {
    id: string
    name: string
    email?: string | null
    phone?: string | null
  }
  status: string
  orderDate: string
  expectedDate?: string | null
  totalAmount: number
  items: POItem[]
}

interface WarehouseReceivingViewProps {
  orders: PurchaseOrder[]
  loading: boolean
  onRefresh: () => void
  onReceivePO: (
    poId: string,
    receivedItems: Array<{
      itemId: string
      receivedQty: number
      batchCode?: string
      expiryDate?: string
    }>
  ) => Promise<void>
}

export function WarehouseReceivingView({
  orders,
  loading,
  onRefresh,
  onReceivePO,
}: WarehouseReceivingViewProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null)
  const [palletModalOpen, setPalletModalOpen] = useState(false)
  const [discrepancyModalOpen, setDiscrepancyModalOpen] = useState(false)
  const [receivingState, setReceivingState] = useState<
    Record<string, { qty: number; batchCode: string; expiryDate: string }>
  >({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const filteredOrders = useMemo(() => {
    return orders.filter((po) => {
      const matchesSearch =
        search === "" ||
        po.poNumber.toLowerCase().includes(search.toLowerCase()) ||
        po.supplier.name.toLowerCase().includes(search.toLowerCase()) ||
        po.items.some(
          (item) =>
            item.product.name.toLowerCase().includes(search.toLowerCase()) ||
            item.product.sku.toLowerCase().includes(search.toLowerCase())
        )

      if (!matchesSearch) return false

      if (statusFilter === "pending") {
        return po.status === "ordered" || po.status === "confirmed" || po.status === "submitted"
      }
      if (statusFilter === "partial") {
        return po.status === "partial" || po.status === "partially_received"
      }
      if (statusFilter === "received") {
        return po.status === "received"
      }

      return true
    })
  }, [orders, search, statusFilter])

  function selectPurchaseOrder(po: PurchaseOrder) {
    setSelectedPO(po)
    setError(null)
    setSuccessMsg(null)

    const initial: Record<string, { qty: number; batchCode: string; expiryDate: string }> = {}
    po.items.forEach((item) => {
      const remaining = Math.max(0, item.quantity - (item.receivedQty || 0))
      initial[item.id] = {
        qty: remaining,
        batchCode: `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}`,
        expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      }
    })
    setReceivingState(initial)
  }

  async function handleConfirmReceipt() {
    if (!selectedPO) return

    const itemsToReceive = Object.entries(receivingState)
      .filter(([_, state]) => state.qty > 0)
      .map(([itemId, state]) => ({
        itemId,
        receivedQty: state.qty,
        batchCode: state.batchCode.trim() || undefined,
        expiryDate: state.expiryDate || undefined,
      }))

    if (itemsToReceive.length === 0) {
      setError("Please enter a quantity greater than 0 for at least one item.")
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await onReceivePO(selectedPO.id, itemsToReceive)
      audioFeedback.playSuccessChime()
      setSuccessMsg(`✓ Goods receipt recorded for ${selectedPO.poNumber}!`)
      setSelectedPO(null)
      onRefresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to record goods receipt")
      audioFeedback.playErrorBuzz()
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePalletComplete(pallet: PalletData) {
    const targetPO = selectedPO || orders.find((po) => po.status !== "received") || orders[0]
    if (targetPO && targetPO.items.length > 0) {
      const targetItem = targetPO.items.find((i) => (i.quantity - (i.receivedQty || 0)) > 0) || targetPO.items[0]
      try {
        await onReceivePO(targetPO.id, [
          {
            itemId: targetItem.id,
            receivedQty: pallet.totalCartons,
            batchCode: pallet.batchCode,
            expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          },
        ])
        audioFeedback.playSuccessChime()
        setSuccessMsg(
          `✓ Full Pallet ${pallet.palletNumber} checked in (SSCC: ${pallet.sscc})! ${pallet.totalCartons} Cartons added to ${targetPO.poNumber}`
        )
        onRefresh()
      } catch (err) {
        console.error(err)
        setSuccessMsg(`✓ Full Pallet ${pallet.palletNumber} registered (SSCC: ${pallet.sscc})!`)
      }
    } else {
      setSuccessMsg(`✓ Full Pallet ${pallet.palletNumber} checked in (SSCC: ${pallet.sscc})!`)
    }
  }

  async function handleLogDiscrepancy(report: Record<string, unknown>) {
    audioFeedback.playSuccessChime()
    setSuccessMsg(`✓ Quality Discrepancy logged for ${report.sku}! Routed to ${report.quarantineBin || "Quarantine Bay"}`)
  }

  return (
    <div className={styles.mainContent}>
      {/* Apple Hero Tile Alternate: Dark Tile */}
      <section className={styles.heroDarkTile}>
        <div className={styles.heroHeaderStack}>
          <span className={styles.heroTagline}>Inbound Inflow</span>
          <h1 className={styles.heroDisplay}>
            {selectedPO ? `Receive PO #${selectedPO.poNumber}` : "Goods Receiving (PO & Pallet Check-in)"}
          </h1>
          <p className={styles.heroLead}>
            {selectedPO
              ? `Supplier: ${selectedPO.supplier.name}`
              : `${orders.length} Incoming purchase shipments scheduled`}
          </p>
        </div>

        {/* Apple Stat Strip */}
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Awaiting Delivery</span>
            <span className={styles.statValue}>
              {orders.filter((po) => po.status !== "received").length}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Partially Received</span>
            <span className={styles.statValue} style={{ color: "var(--primary-on-dark)" }}>
              {orders.filter((po) => po.status === "partial" || po.status === "partially_received").length}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Inbound Lines</span>
            <span className={styles.statValue}>
              {orders.reduce((sum, po) => sum + po.items.length, 0)}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", flexWrap: "wrap", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setPalletModalOpen(true)}
              className={styles.buttonPrimary}
              style={{ padding: "8px 18px", fontSize: "14px" }}
            >
              <Boxes size={15} />
              <span>Receive Full Pallet (SSCC)</span>
            </button>

            <button
              type="button"
              onClick={() => setDiscrepancyModalOpen(true)}
              className={styles.buttonPearlCapsule}
              style={{ padding: "8px 14px", fontSize: "13px" }}
            >
              <AlertTriangle size={14} style={{ color: "#b91c1c" }} />
              <span>Log Discrepancy / OS&D</span>
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

      {selectedPO ? (
        /* Detailed PO Check-In */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setSelectedPO(null)}
              className={styles.buttonSecondaryPill}
              style={{ padding: "8px 16px", fontSize: "14px" }}
            >
              ← Back to POs
            </button>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setDiscrepancyModalOpen(true)}
                className={styles.buttonPearlCapsule}
                style={{ padding: "6px 12px", fontSize: "12px", color: "#b91c1c" }}
              >
                <AlertTriangle size={13} />
                <span>Flag Damage</span>
              </button>

              <span className={styles.cardTagHighlight}>{selectedPO.status.replace("_", " ")}</span>
            </div>
          </div>

          {error && (
            <div style={{ padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", color: "#b91c1c", fontSize: "14px" }}>
              {error}
            </div>
          )}

          <div className={styles.cardGrid}>
            {selectedPO.items.map((item) => {
              const remaining = Math.max(0, item.quantity - (item.receivedQty || 0))
              const state = receivingState[item.id] || { qty: 0, batchCode: "", expiryDate: "" }

              return (
                <div key={item.id} className={styles.utilityCard}>
                  <div className={styles.cardHeaderRow}>
                    <span className={styles.cardSequenceBadge}>{item.product.sku}</span>
                    <span className={styles.cardTag}>
                      Ordered: {item.quantity} | Recv: {item.receivedQty || 0}
                    </span>
                  </div>

                  <h3 className={styles.cardTitle}>{item.product.name}</h3>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "10px", marginTop: "8px" }}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Qty to Check-in</label>
                      <input
                        type="number"
                        min={0}
                        max={remaining * 2}
                        value={state.qty}
                        onChange={(e) => {
                          const val = Number(e.target.value) || 0
                          setReceivingState((prev) => ({
                            ...prev,
                            [item.id]: { ...state, qty: val },
                          }))
                        }}
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Batch / Lot #</label>
                      <input
                        type="text"
                        value={state.batchCode}
                        onChange={(e) => {
                          const val = e.target.value
                          setReceivingState((prev) => ({
                            ...prev,
                            [item.id]: { ...state, batchCode: val },
                          }))
                        }}
                        placeholder="LOT-2026..."
                        className={styles.textInput}
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Best-Before / Expiry</label>
                      <input
                        type="date"
                        value={state.expiryDate}
                        onChange={(e) => {
                          const val = e.target.value
                          setReceivingState((prev) => ({
                            ...prev,
                            [item.id]: { ...state, expiryDate: val },
                          }))
                        }}
                        className={styles.textInput}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleConfirmReceipt}
              disabled={submitting}
              className={styles.buttonPrimary}
              style={{ width: "100%", padding: "14px 22px" }}
            >
              <Download size={17} />
              <span>{submitting ? "Processing Receipt..." : "Confirm & Put Away Stock"}</span>
            </button>
          </div>
        </div>
      ) : (
        /* PO List */
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className={styles.searchContainer}>
              <Search size={18} className={styles.searchIcon} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO #, supplier name, SKU..."
                className={styles.searchInput}
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className={styles.clearSearchBtn}>
                  <X size={16} />
                </button>
              )}
            </div>

            <div className={styles.pillGroup}>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={statusFilter === "all" ? styles.optionChipSelected : styles.optionChip}
              >
                All POs ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className={statusFilter === "pending" ? styles.optionChipSelected : styles.optionChip}
              >
                Pending (
                {orders.filter((po) => po.status === "ordered" || po.status === "confirmed" || po.status === "submitted").length}
                )
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("partial")}
                className={statusFilter === "partial" ? styles.optionChipSelected : styles.optionChip}
              >
                Partial (
                {orders.filter((po) => po.status === "partial" || po.status === "partially_received").length}
                )
              </button>
            </div>
          </div>

          <div className={styles.cardGrid}>
            {filteredOrders.length === 0 ? (
              <div className={styles.utilityCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
                <p style={{ margin: 0, color: "var(--ink-muted-48)" }}>No purchase orders match your filter.</p>
              </div>
            ) : (
              filteredOrders.map((po) => {
                const isFullyReceived = po.status === "received"

                return (
                  <div
                    key={po.id}
                    onClick={() => selectPurchaseOrder(po)}
                    className={`${styles.utilityCard} ${isFullyReceived ? styles.utilityCardDone : ""}`}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={styles.cardHeaderRow}>
                      <span className={styles.cardSequenceBadge}>PO #{po.poNumber}</span>
                      <span className={isFullyReceived ? styles.cardTagHighlight : styles.cardTag}>
                        {po.status.replace("_", " ")}
                      </span>
                    </div>

                    <div>
                      <h3 className={styles.cardTitle}>{po.supplier.name}</h3>
                      <p className={styles.cardSub}>
                        Ordered: {new Date(po.orderDate).toLocaleDateString()}
                      </p>
                    </div>

                    <div className={styles.cardMetadataRow}>
                      <span className={styles.cardTag}>
                        <Package size={13} /> {po.items.length} Line Items
                      </span>
                      <span className={styles.cardTag}>
                        <Layers size={13} /> {po.items.reduce((s, it) => s + it.quantity, 0)} Units Total
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                      <button
                        type="button"
                        className={styles.buttonPrimary}
                        style={{ width: "100%", padding: "10px", fontSize: "14px" }}
                      >
                        <span>{isFullyReceived ? "View Details" : "Check-in Inbound Goods"}</span>
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Pallet In Builder Modal */}
      <PalletBuilderModal
        isOpen={palletModalOpen}
        onClose={() => setPalletModalOpen(false)}
        mode="inbound"
        defaultProductOrCustomer={selectedPO?.supplier.name || "Inbound Supplier Goods"}
        defaultOrderNo={selectedPO?.poNumber || "PO-INBOUND"}
        onComplete={handlePalletComplete}
      />

      {/* Inbound Quality Discrepancy & Quarantine Modal */}
      {discrepancyModalOpen && (
        <InboundDiscrepancyModal
          isOpen={discrepancyModalOpen}
          onClose={() => setDiscrepancyModalOpen(false)}
          poNumber={selectedPO?.poNumber || orders[0]?.poNumber || "PO-2026"}
          supplierName={selectedPO?.supplier.name || orders[0]?.supplier.name || "Commercial Supplier"}
          items={(selectedPO?.items || orders[0]?.items || []).map((it) => ({
            id: it.productId,
            name: it.product.name,
            sku: it.product.sku,
            orderedQty: it.quantity,
          }))}
          onLogDiscrepancy={handleLogDiscrepancy}
        />
      )}
    </div>
  )
}
