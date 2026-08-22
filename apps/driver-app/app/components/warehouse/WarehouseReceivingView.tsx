"use client"

import { useMemo, useState } from "react"
import {
  ArrowRight,
  Boxes,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  Download,
  Hash,
  Layers,
  Package,
  Plus,
  RefreshCw,
  Search,
  Truck,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
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

    // Pre-populate receiving inputs with remaining balance
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
      setError("Please enter quantity greater than 0 for at least one item.")
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      await onReceivePO(selectedPO.id, itemsToReceive)
      audioFeedback.playSuccessChime()
      setSuccessMsg(`✓ Goods received successfully for ${selectedPO.poNumber}!`)
      setSelectedPO(null)
      onRefresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to receive goods")
      audioFeedback.playErrorBuzz()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.routeContainer}>
      {/* Header */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryTop}>
          <div>
            <span className={styles.badgePrimary}>Inbound Inflow</span>
            <h2 className={styles.summaryTitle}>
              {selectedPO ? `Receive PO: ${selectedPO.poNumber}` : "Goods Receiving (PO Check-in)"}
            </h2>
            <p className={styles.summarySub}>
              {selectedPO
                ? `Supplier: ${selectedPO.supplier.name}`
                : `${orders.length} Incoming Purchase Orders`}
            </p>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} className={styles.iconBtn}>
            <RefreshCw size={18} className={loading ? styles.spin : ""} />
          </button>
        </div>

        <div className={styles.metricsGrid}>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Awaiting Delivery</span>
            <span className={styles.metricNumber} style={{ color: "#fbbf24" }}>
              {orders.filter((po) => po.status !== "received").length}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Partially Received</span>
            <span className={styles.metricNumber} style={{ color: "#38bdf8" }}>
              {orders.filter((po) => po.status === "partial" || po.status === "partially_received").length}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Total Inbound Lines</span>
            <span className={styles.metricNumber} style={{ color: "#34d399" }}>
              {orders.reduce((sum, po) => sum + po.items.length, 0)}
            </span>
          </div>
        </div>
      </div>

      {successMsg && (
        <div className={styles.successBanner}>
          <span>{successMsg}</span>
          <button type="button" onClick={() => setSuccessMsg(null)} className={styles.clearSearchBtn}>
            <X size={14} />
          </button>
        </div>
      )}

      {selectedPO ? (
        /* Detailed PO Line Items Check-In Form */
        <div className={styles.pickingDetailContainer}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <button
              type="button"
              onClick={() => setSelectedPO(null)}
              className={styles.secondaryBtn}
              style={{ padding: "8px 14px", fontSize: "13px" }}
            >
              ← Back to POs
            </button>

            <span className={styles.statusPillInfo}>{selectedPO.status.replace("_", " ")}</span>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <div className={styles.stopsList}>
            {selectedPO.items.map((item) => {
              const remaining = Math.max(0, item.quantity - (item.receivedQty || 0))
              const state = receivingState[item.id] || { qty: 0, batchCode: "", expiryDate: "" }

              return (
                <div key={item.id} className={styles.stopCard}>
                  <div className={styles.stopCardTop}>
                    <span className={styles.skuTag}>{item.product.sku}</span>
                    <span style={{ fontSize: "13px", color: "#94a3b8" }}>
                      Ordered: {item.quantity} | Recv: {item.receivedQty || 0}
                    </span>
                  </div>

                  <h3 className={styles.pickItemName} style={{ marginTop: "4px" }}>
                    {item.product.name}
                  </h3>

                  {/* Quantity Receiving Input */}
                  <div style={{ marginTop: "12px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div className={styles.formGroup}>
                      <label className={styles.formLabel}>Qty to Receive</label>
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
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginTop: "16px" }}>
            <button
              type="button"
              onClick={handleConfirmReceipt}
              disabled={submitting}
              className={styles.primaryBtn}
              style={{ width: "100%", padding: "14px", fontSize: "15px" }}
            >
              <Download size={18} />
              <span>{submitting ? "Processing Goods Receipt..." : "Confirm & Put Away Stock"}</span>
            </button>
          </div>
        </div>
      ) : (
        /* POs List */
        <>
          <div className={styles.filterSection}>
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search PO #, supplier name, SKU..."
                className={styles.searchInput}
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} className={styles.clearSearchBtn}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className={styles.pillGroup}>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={statusFilter === "all" ? styles.activePill : styles.pill}
              >
                All ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className={statusFilter === "pending" ? styles.activePill : styles.pill}
              >
                Pending (
                {orders.filter((po) => po.status === "ordered" || po.status === "confirmed" || po.status === "submitted").length}
                )
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("partial")}
                className={statusFilter === "partial" ? styles.activePill : styles.pill}
              >
                Partial (
                {orders.filter((po) => po.status === "partial" || po.status === "partially_received").length}
                )
              </button>
            </div>
          </div>

          <div className={styles.stopsList}>
            {filteredOrders.length === 0 ? (
              <div className={styles.emptySearchCard}>
                <p>No purchase orders match your filter.</p>
              </div>
            ) : (
              filteredOrders.map((po) => {
                const isFullyReceived = po.status === "received"

                return (
                  <div
                    key={po.id}
                    onClick={() => selectPurchaseOrder(po)}
                    className={`${styles.stopCard} ${isFullyReceived ? styles.stopDelivered : ""}`}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={styles.stopCardTop}>
                      <span className={styles.badgePrimary}>PO #{po.poNumber}</span>
                      <span
                        className={
                          isFullyReceived
                            ? styles.statusPillSuccess
                            : po.status === "partial"
                            ? styles.statusPillInfo
                            : styles.statusPillWarning
                        }
                      >
                        {po.status.replace("_", " ")}
                      </span>
                    </div>

                    <div style={{ marginTop: "4px" }}>
                      <h3 className={styles.stopCustomerName}>{po.supplier.name}</h3>
                      <p className={styles.stopOrderMeta}>
                        Ordered: {new Date(po.orderDate).toLocaleDateString()}
                      </p>
                    </div>

                    <div className={styles.stopMetricsRow}>
                      <div className={styles.stopMetricTag}>
                        <Package size={14} />
                        <span>{po.items.length} Line Items</span>
                      </div>
                      <div className={styles.stopMetricTag}>
                        <Layers size={14} />
                        <span>
                          Total Qty: {po.items.reduce((s, it) => s + it.quantity, 0)} units
                        </span>
                      </div>
                    </div>

                    <div className={styles.stopActionRow}>
                      <button
                        type="button"
                        className={styles.actionBtnPrimary}
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        <span>{isFullyReceived ? "View Details" : "Check-in Goods"}</span>
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
