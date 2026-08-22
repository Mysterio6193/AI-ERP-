"use client"

import { useMemo, useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Send,
  Truck,
  User,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
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
  deliveryMethod?: string | null
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

export function WarehouseDispatchView({
  orders,
  loading,
  onRefresh,
  onDispatchOrder,
}: WarehouseDispatchViewProps) {
  const [search, setSearch] = useState("")
  const [selectedOrder, setSelectedOrder] = useState<DispatchOrder | null>(null)
  const [carrier, setCarrier] = useState("Australia Post eParcel")
  const [consignment, setConsignment] = useState("")
  const [dispatching, setDispatching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      return (
        search === "" ||
        order.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        order.customerName.toLowerCase().includes(search.toLowerCase()) ||
        order.deliveryAddress.toLowerCase().includes(search.toLowerCase()) ||
        (order.carrierName && order.carrierName.toLowerCase().includes(search.toLowerCase())) ||
        (order.assignedDriverName &&
          order.assignedDriverName.toLowerCase().includes(search.toLowerCase()))
      )
    })
  }, [orders, search])

  function openDispatchModal(order: DispatchOrder) {
    setSelectedOrder(order)
    setCarrier(order.carrierName || "Australia Post eParcel")
    setConsignment(order.consignmentNumber || `AP-${Math.floor(10000000 + Math.random() * 90000000)}AU`)
    setError(null)
  }

  async function handleConfirmDispatch() {
    if (!selectedOrder) return

    try {
      setDispatching(true)
      setError(null)

      await onDispatchOrder(selectedOrder.id, {
        status: "dispatched",
        carrierName: carrier,
        consignmentNumber: consignment.trim() || undefined,
      })

      audioFeedback.playSuccessChime()
      setSuccessMsg(`✓ Order ${selectedOrder.orderNumber} marked as dispatched!`)
      setSelectedOrder(null)
      onRefresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to dispatch order")
      audioFeedback.playErrorBuzz()
    } finally {
      setDispatching(false)
    }
  }

  return (
    <div className={styles.routeContainer}>
      {/* Header */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryTop}>
          <div>
            <span className={styles.badgePrimary}>Outbound Staging</span>
            <h2 className={styles.summaryTitle}>Dispatch & Courier Staging</h2>
            <p className={styles.summarySub}>{orders.length} Orders Packed & Ready for Dispatch</p>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} className={styles.iconBtn}>
            <RefreshCw size={18} className={loading ? styles.spin : ""} />
          </button>
        </div>

        <div className={styles.metricsGrid}>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Staged & Packed</span>
            <span className={styles.metricNumber} style={{ color: "#38bdf8" }}>
              {orders.filter((o) => o.status === "packed").length}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Fleet Runs</span>
            <span className={styles.metricNumber} style={{ color: "#34d399" }}>
              {orders.filter((o) => o.assignedDriverName || o.routeNumber).length}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>3PL Freight</span>
            <span className={styles.metricNumber} style={{ color: "#fbbf24" }}>
              {orders.filter((o) => !o.assignedDriverName && !o.routeNumber).length}
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

      {/* Search */}
      <div className={styles.filterSection}>
        <div className={styles.searchBar}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, driver, address..."
            className={styles.searchInput}
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className={styles.clearSearchBtn}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Staged Orders List */}
      <div className={styles.stopsList}>
        {filteredOrders.length === 0 ? (
          <div className={styles.emptySearchCard}>
            <p>No staged orders found.</p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isFleet = Boolean(order.assignedDriverName || order.routeNumber)

            return (
              <div key={order.id} className={styles.stopCard}>
                <div className={styles.stopCardTop}>
                  <span className={styles.badgePrimary}>Order #{order.orderNumber}</span>
                  <span className={isFleet ? styles.statusPillInfo : styles.statusPillWarning}>
                    {isFleet ? `Fleet: ${order.assignedDriverName || "Assigned"}` : "3PL Courier"}
                  </span>
                </div>

                <div style={{ marginTop: "4px" }}>
                  <h3 className={styles.stopCustomerName}>{order.customerName}</h3>
                  <div className={styles.stopAddressRow} style={{ marginTop: "4px" }}>
                    <MapPin size={14} className={styles.stopIcon} />
                    <span>{order.deliveryAddress}</span>
                  </div>
                </div>

                <div className={styles.stopMetricsRow}>
                  <div className={styles.stopMetricTag}>
                    <Package size={14} />
                    <span>{order.itemsCount} Line Items</span>
                  </div>
                  {order.routeNumber && (
                    <div className={styles.stopMetricTag}>
                      <Truck size={14} />
                      <span>Run #{order.routeNumber}</span>
                    </div>
                  )}
                  {order.requiredDate && (
                    <div className={styles.stopMetricTag}>
                      <Clock size={14} />
                      <span>Req: {new Date(order.requiredDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className={styles.stopActionRow}>
                  <button
                    type="button"
                    onClick={() => openDispatchModal(order)}
                    className={styles.actionBtnPrimary}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    <Send size={15} />
                    <span>Confirm Dispatch & Release</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Dispatch Confirmation Modal */}
      {selectedOrder && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.badgePrimary}>Order #{selectedOrder.orderNumber}</span>
                <h3 className={styles.modalTitle}>{selectedOrder.customerName}</h3>
                <p className={styles.modalSub}>{selectedOrder.deliveryAddress}</p>
              </div>
              <button type="button" onClick={() => setSelectedOrder(null)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {error && <div className={styles.errorBanner}>{error}</div>}

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Carrier / Route</label>
                <select
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="Australia Post eParcel">Australia Post eParcel</option>
                  <option value="StarTrack Express">StarTrack Express</option>
                  <option value="TNT Road Express">TNT Road Express</option>
                  <option value="Direct Freight Express">Direct Freight Express</option>
                  <option value="Internal Fleet Route 1">Internal Fleet Route 1</option>
                  <option value="Internal Fleet Route 2">Internal Fleet Route 2</option>
                  <option value="Customer Pickup / Counter">Customer Pickup / Counter</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Consignment / Tracking Number</label>
                <input
                  type="text"
                  value={consignment}
                  onChange={(e) => setConsignment(e.target.value)}
                  placeholder="e.g. AP-92837492AU"
                  className={styles.textInput}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedOrder(null)}
                  className={styles.secondaryBtn}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDispatch}
                  disabled={dispatching}
                  className={styles.primaryBtn}
                  style={{ flex: 2 }}
                >
                  <Send size={18} />
                  <span>{dispatching ? "Releasing..." : "Confirm Outbound"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
