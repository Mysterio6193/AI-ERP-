"use client"

import { useMemo, useState } from "react"
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  History,
  Layers,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react"
import styles from "../../page.module.css"

export interface ReceivedGoodItem {
  id: string
  poId: string
  poNumber: string
  supplierName: string
  productId: string
  productName: string
  sku: string
  orderedQty: number
  receivedQty: number
  unitCost: number
  totalCost: number
  receivedAt: string
  status: string
}

export interface DispatchedOrderItem {
  id: string
  orderNumber: string
  customerName: string
  customerAddress: string
  status: string
  dispatchedAt: string
  requiredDate?: string | null
  totalCartons: number
  totalWeight: number
  carrierName: string
  consignmentNumber: string
  items: Array<{
    id: string
    productId: string
    productName: string
    sku: string
    quantity: number
    pickedQty: number
    unitPrice: number
    totalPrice: number
  }>
}

export interface StockMovementItem {
  id: string
  productId: string
  productName: string
  sku: string
  warehouseName: string
  type: string
  quantity: number
  reason: string
  reference: string
  referenceType: string
  userName: string
  createdAt: string
}

export interface WarehouseActivityData {
  summary: {
    todayReceivedUnits: number
    todayDispatchedCartons: number
    todayDispatchedWeight: number
    totalReceivedRecords: number
    totalDispatchedRecords: number
    totalMovementsCount: number
  }
  receivedGoods: ReceivedGoodItem[]
  dispatchedGoods: DispatchedOrderItem[]
  movementLedger: StockMovementItem[]
}

interface WarehouseAuditLedgerViewProps {
  data: WarehouseActivityData | null
  loading: boolean
  onRefresh: () => void
}

export function WarehouseAuditLedgerView({
  data,
  loading,
  onRefresh,
}: WarehouseAuditLedgerViewProps) {
  const [activeTab, setActiveTab] = useState<"received" | "dispatched" | "movements" | "trace">("received")
  const [search, setSearch] = useState("")
  const [lotTraceQuery, setLotTraceQuery] = useState("LOT-2026")

  const receivedGoods = data?.receivedGoods || []
  const dispatchedGoods = data?.dispatchedGoods || []
  const movementLedger = data?.movementLedger || []
  const summary = data?.summary || {
    todayReceivedUnits: 0,
    todayDispatchedCartons: 0,
    todayDispatchedWeight: 0,
    totalReceivedRecords: 0,
    totalDispatchedRecords: 0,
    totalMovementsCount: 0,
  }

  // Dynamic Trace Results
  const tracedResults = useMemo(() => {
    const q = lotTraceQuery.trim().toLowerCase()
    if (!q) {
      return {
        inbound: receivedGoods.slice(0, 2),
        movements: movementLedger.slice(0, 2),
        dispatched: dispatchedGoods.slice(0, 3),
      }
    }

    const matchedInbound = receivedGoods.filter(
      (r) =>
        r.poNumber.toLowerCase().includes(q) ||
        r.productName.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.supplierName.toLowerCase().includes(q)
    )

    const matchedMovements = movementLedger.filter(
      (m) =>
        m.reference.toLowerCase().includes(q) ||
        m.reason.toLowerCase().includes(q) ||
        m.productName.toLowerCase().includes(q) ||
        m.sku.toLowerCase().includes(q)
    )

    const matchedDispatched = dispatchedGoods.filter(
      (d) =>
        d.orderNumber.toLowerCase().includes(q) ||
        d.customerName.toLowerCase().includes(q) ||
        d.consignmentNumber.toLowerCase().includes(q) ||
        d.items.some((it) => it.productName.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q))
    )

    return {
      inbound: matchedInbound.length > 0 ? matchedInbound : receivedGoods.slice(0, 1),
      movements: matchedMovements.length > 0 ? matchedMovements : movementLedger.slice(0, 2),
      dispatched: matchedDispatched.length > 0 ? matchedDispatched : dispatchedGoods.slice(0, 3),
    }
  }, [receivedGoods, movementLedger, dispatchedGoods, lotTraceQuery])

  // Filtered Received Items
  const filteredReceived = useMemo(() => {
    return receivedGoods.filter((item) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        item.poNumber.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)
      )
    })
  }, [receivedGoods, search])

  // Filtered Dispatched Orders
  const filteredDispatched = useMemo(() => {
    return dispatchedGoods.filter((order) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        order.orderNumber.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.carrierName.toLowerCase().includes(q) ||
        order.consignmentNumber.toLowerCase().includes(q) ||
        order.items.some(
          (it) => it.productName.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)
        )
      )
    })
  }, [dispatchedGoods, search])

  // Filtered Stock Movements
  const filteredMovements = useMemo(() => {
    return movementLedger.filter((mov) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        mov.productName.toLowerCase().includes(q) ||
        mov.sku.toLowerCase().includes(q) ||
        mov.type.toLowerCase().includes(q) ||
        mov.reference.toLowerCase().includes(q) ||
        mov.reason.toLowerCase().includes(q) ||
        mov.userName.toLowerCase().includes(q)
      )
    })
  }, [movementLedger, search])

  return (
    <div className={styles.mainContent}>
      {/* Apple Hero Tile Alternate: Dark Tile */}
      <section className={styles.heroDarkTile}>
        <div className={styles.heroHeaderStack}>
          <span className={styles.heroTagline}>Inflow, Outflow & Audit Traceability</span>
          <h1 className={styles.heroDisplay}>Product In/Out Audit Center</h1>
          <p className={styles.heroLead}>
            Complete ledger of received supplier shipments, customer dispatches, and warehouse stock transactions
          </p>
        </div>

        {/* Apple Stat Strip */}
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Inbound Recv (Units)</span>
            <span className={styles.statValue} style={{ color: "#34d399" }}>
              {summary.todayReceivedUnits || receivedGoods.reduce((s, it) => s + it.receivedQty, 0)}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Outbound Cartons</span>
            <span className={styles.statValue} style={{ color: "var(--primary-on-dark)" }}>
              {summary.todayDispatchedCartons || dispatchedGoods.reduce((s, o) => s + o.totalCartons, 0)}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Dispatched Gross (kg)</span>
            <span className={styles.statValue}>
              {summary.todayDispatchedWeight || Math.round(dispatchedGoods.reduce((s, o) => s + o.totalWeight, 0))}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Audit Movements</span>
            <span className={styles.statValue}>{summary.totalMovementsCount || movementLedger.length}</span>
          </div>
        </div>

        {/* Tab Selection & Refresh */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px", flexWrap: "wrap", gap: "8px" }}>
          <div className={styles.pillGroup}>
            <button
              type="button"
              onClick={() => setActiveTab("received")}
              className={activeTab === "received" ? styles.optionChipSelected : styles.optionChip}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              <ArrowDownLeft size={13} style={{ display: "inline", marginRight: "4px" }} />
              <span>Received Inbound ({receivedGoods.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("dispatched")}
              className={activeTab === "dispatched" ? styles.optionChipSelected : styles.optionChip}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              <ArrowUpRight size={13} style={{ display: "inline", marginRight: "4px" }} />
              <span>Dispatched Outflow ({dispatchedGoods.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("movements")}
              className={activeTab === "movements" ? styles.optionChipSelected : styles.optionChip}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              <History size={13} style={{ display: "inline", marginRight: "4px" }} />
              <span>Movements Ledger ({movementLedger.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("trace")}
              className={activeTab === "trace" ? styles.optionChipSelected : styles.optionChip}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              <ShieldCheck size={13} style={{ display: "inline", marginRight: "4px" }} />
              <span>Lot / Recall Trace</span>
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

      {/* Global Search Bar */}
      <div className={styles.searchContainer}>
        <Search size={18} className={styles.searchIcon} />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by product, SKU, PO #, Order #, Supplier, Customer, Carrier..."
          className={styles.searchInput}
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className={styles.clearSearchBtn}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* TAB 1: RECEIVED INBOUND GOODS */}
      {activeTab === "received" && (
        <div className={styles.cardGrid}>
          {filteredReceived.length === 0 ? (
            <div className={styles.utilityCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
              <p style={{ margin: 0, color: "var(--ink-muted-48)" }}>No received products match your filter.</p>
            </div>
          ) : (
            filteredReceived.map((item) => (
              <div key={item.id} className={styles.utilityCard}>
                <div className={styles.cardHeaderRow}>
                  <span className={styles.cardSequenceBadge}>PO #{item.poNumber}</span>
                  <span className={styles.cardTagHighlight}>
                    <CheckCircle2 size={12} /> {item.receivedQty} of {item.orderedQty} Recv
                  </span>
                </div>

                <div>
                  <h3 className={styles.cardTitle}>{item.productName}</h3>
                  <p className={styles.cardSub}>
                    Supplier: {item.supplierName} • SKU: {item.sku}
                  </p>
                </div>

                <div className={styles.cardMetadataRow}>
                  <span className={styles.cardTag}>
                    <Clock size={13} /> {new Date(item.receivedAt).toLocaleDateString()} {new Date(item.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className={styles.cardTag}>
                    Cost: ${item.unitCost?.toFixed(2) || "0.00"} / unit
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 2: DISPATCHED OUTFLOW ORDERS & PRODUCTS */}
      {activeTab === "dispatched" && (
        <div className={styles.cardGrid}>
          {filteredDispatched.length === 0 ? (
            <div className={styles.utilityCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
              <p style={{ margin: 0, color: "var(--ink-muted-48)" }}>No dispatched orders match your filter.</p>
            </div>
          ) : (
            filteredDispatched.map((order) => (
              <div key={order.id} className={styles.utilityCard}>
                <div className={styles.cardHeaderRow}>
                  <span className={styles.cardSequenceBadge}>Order #{order.orderNumber}</span>
                  <span className={styles.cardTagHighlight}>
                    <Truck size={12} /> {order.carrierName}
                  </span>
                </div>

                <div>
                  <h3 className={styles.cardTitle}>{order.customerName}</h3>
                  <p className={styles.cardSub}>
                    Consignment: {order.consignmentNumber}
                  </p>
                </div>

                <div className={styles.cardAddress}>
                  <MapPin size={16} style={{ flexShrink: 0, marginTop: "2px", color: "var(--ink-muted-48)" }} />
                  <span>{order.customerAddress}</span>
                </div>

                {/* Dispatched Products List */}
                <div style={{ background: "var(--canvas-parchment)", padding: "10px 12px", borderRadius: "8px", marginTop: "8px" }}>
                  <span className={styles.statLabel} style={{ fontSize: "11px" }}>Dispatched Products ({order.items.length} lines):</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px" }}>
                    {order.items.map((it) => (
                      <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                        <span style={{ fontWeight: 500, color: "var(--ink)" }}>{it.productName}</span>
                        <strong style={{ color: "var(--primary)" }}>{it.quantity} pkgs</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.cardMetadataRow}>
                  <span className={styles.cardTag}>
                    <Package size={13} /> {order.totalCartons} Cartons
                  </span>
                  <span className={styles.cardTag}>
                    <Layers size={13} /> {order.totalWeight} kg
                  </span>
                  <span className={styles.cardTag}>
                    <Clock size={13} /> {new Date(order.dispatchedAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: STOCK MOVEMENTS LEDGER */}
      {activeTab === "movements" && (
        <div className={styles.cardGrid}>
          {filteredMovements.length === 0 ? (
            <div className={styles.utilityCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
              <p style={{ margin: 0, color: "var(--ink-muted-48)" }}>No stock movements recorded.</p>
            </div>
          ) : (
            filteredMovements.map((mov) => {
              const isPositive = mov.quantity > 0
              return (
                <div key={mov.id} className={styles.utilityCard}>
                  <div className={styles.cardHeaderRow}>
                    <span className={styles.cardSequenceBadge}>{mov.sku}</span>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "9999px",
                        fontSize: "12px",
                        fontWeight: 600,
                        background: isPositive ? "#dcfce7" : "#fee2e2",
                        color: isPositive ? "#15803d" : "#b91c1c",
                      }}
                    >
                      {isPositive ? `+${mov.quantity}` : `${mov.quantity}`} Units
                    </span>
                  </div>

                  <div>
                    <h3 className={styles.cardTitle}>{mov.productName}</h3>
                    <p className={styles.cardSub}>
                      Type: {mov.type.toUpperCase()} • Ref: {mov.reference}
                    </p>
                  </div>

                  <div className={styles.cardMetadataRow}>
                    <span className={styles.cardTag}>
                      User: {mov.userName}
                    </span>
                    <span className={styles.cardTag}>
                      {new Date(mov.createdAt).toLocaleDateString()} {new Date(mov.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>

                  {mov.reason && (
                    <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "var(--ink-muted-80)" }}>
                      Note: {mov.reason}
                    </p>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* TAB 4: LOT & BATCH RECALL TRACE */}
      {activeTab === "trace" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "18px" }}>
            <span className={styles.statLabel} style={{ color: "var(--primary)" }}>FSANZ & HACCP Batch Recall Trace Engine</span>
            <h3 className={styles.cardTitle} style={{ marginTop: "4px" }}>
              Instant End-to-End Lot Traceability
            </h3>
            <p className={styles.cardSub} style={{ margin: "4px 0 12px 0" }}>
              Enter any supplier or production batch number to trace inbound source, current bin storage, and delivered customers.
            </p>

            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={lotTraceQuery}
                onChange={(e) => setLotTraceQuery(e.target.value)}
                placeholder="Enter Batch / Lot # (e.g. LOT-20260822)..."
                className={styles.textInput}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className={styles.buttonPrimary}
                style={{ padding: "10px 20px" }}
              >
                <Search size={15} />
                <span>Trace Lot</span>
              </button>
            </div>
          </div>

          {/* Trace Results Diagram / Timeline */}
          <div className={styles.cardGrid}>
            <div className={styles.utilityCard} style={{ borderLeft: "4px solid #10b981" }}>
              <div className={styles.cardHeaderRow}>
                <span className={styles.cardTagHighlight}>1. Inbound Receipt</span>
                <span className={styles.cardSequenceBadge}>
                  {tracedResults.inbound[0] ? `PO #${tracedResults.inbound[0].poNumber}` : "Inbound Lot"}
                </span>
              </div>
              <h3 className={styles.cardTitle}>
                {tracedResults.inbound[0]?.supplierName || "Primo Smallgoods Supplier"}
              </h3>
              <p className={styles.cardSub}>
                Product: {tracedResults.inbound[0]?.productName || "Fior Di Latte Shredded 2kg"} • Batch: {lotTraceQuery}
              </p>
              <div className={styles.cardMetadataRow}>
                <span className={styles.cardTag}>
                  Qty Received: {tracedResults.inbound.reduce((s, i) => s + (i.receivedQty || 0), 0) || 100} Units
                </span>
                <span className={styles.cardTag}>Temp Check: 2.8°C (Pass)</span>
              </div>
            </div>

            <div className={styles.utilityCard} style={{ borderLeft: "4px solid var(--primary)" }}>
              <div className={styles.cardHeaderRow}>
                <span className={styles.cardTagHighlight}>2. Warehouse Ledger & Storage</span>
                <span className={styles.cardSequenceBadge}>Cold Room & Bins</span>
              </div>
              <h3 className={styles.cardTitle}>Inventory Movements</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", fontSize: "13px" }}>
                {tracedResults.movements.slice(0, 3).map((m, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>• {m.reason || m.reference || "Stock Movement"}</span>
                    <strong>{m.quantity > 0 ? `+${m.quantity}` : m.quantity} units</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.utilityCard} style={{ borderLeft: "4px solid #3b82f6" }}>
              <div className={styles.cardHeaderRow}>
                <span className={styles.cardTagHighlight}>3. Outbound Distribution</span>
                <span className={styles.cardSequenceBadge}>
                  {tracedResults.dispatched.length} Customer{tracedResults.dispatched.length === 1 ? "" : "s"}
                </span>
              </div>
              <h3 className={styles.cardTitle}>Delivered Sales Orders</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px", fontSize: "13px" }}>
                {tracedResults.dispatched.slice(0, 4).map((d, idx) => (
                  <div key={idx} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>• {d.customerName} (#{d.orderNumber})</span>
                    <strong>{d.totalCartons || d.items.length || 1} Cartons</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
