"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Map,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { ScannerModal } from "../ui/ScannerModal"
import { WarehouseBinMap } from "./WarehouseBinMap"
import { CartonPackingStationModal } from "./CartonPackingStationModal"
import { ShortPickModal } from "./ShortPickModal"
import styles from "../../page.module.css"

export interface PickItem {
  id: string
  productId: string
  productName: string
  sku: string
  location: string
  requiredQty: number
  pickedQty: number
  status: string
  batchCode?: string
  measuredWeight?: number
}

export interface PickList {
  id: string
  pickNumber: string
  orderId: string
  orderNumber: string
  customerName: string
  assignedTo: string | null
  assignedToId: string | null
  status: string
  priority: string
  warehouseName: string
  createdAt: string
  progress: number
  items: PickItem[]
}

interface WarehousePickingViewProps {
  pickLists: PickList[]
  loading: boolean
  onRefresh: () => void
  onUpdatePickItem: (pickListId: string, itemId: string, incrementBy: number) => Promise<void>
  onPackOrder?: (orderId: string, payload: Record<string, unknown>) => Promise<void>
}

export function WarehousePickingView({
  pickLists,
  loading,
  onRefresh,
  onUpdatePickItem,
  onPackOrder,
}: WarehousePickingViewProps) {
  const [viewTab, setViewTab] = useState<"items" | "map">("items")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedPick, setSelectedPick] = useState<PickList | null>(null)
  const [packingOrder, setPackingOrder] = useState<PickList | null>(null)
  const [shortPickItem, setShortPickItem] = useState<PickItem | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const filteredPickLists = useMemo(() => {
    return pickLists.filter((pick) => {
      const matchesSearch =
        search === "" ||
        pick.pickNumber.toLowerCase().includes(search.toLowerCase()) ||
        pick.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
        pick.customerName.toLowerCase().includes(search.toLowerCase()) ||
        pick.items.some(
          (item) =>
            item.productName.toLowerCase().includes(search.toLowerCase()) ||
            item.sku.toLowerCase().includes(search.toLowerCase())
        )

      if (!matchesSearch) return false

      if (statusFilter === "pending") {
        return pick.status === "pending"
      }
      if (statusFilter === "in_progress") {
        return pick.status === "in_progress"
      }
      if (statusFilter === "completed") {
        return pick.status === "completed"
      }

      return true
    })
  }, [pickLists, search, statusFilter])

  const activePick = useMemo(() => {
    if (!selectedPick) return null
    return pickLists.find((p) => p.id === selectedPick.id) || selectedPick
  }, [pickLists, selectedPick])

  async function handlePickIncrement(item: PickItem, incrementBy: number) {
    if (!activePick) return
    try {
      setSavingItemId(item.id)
      await onUpdatePickItem(activePick.id, item.id, incrementBy)
      audioFeedback.playPickBeep()
    } catch (err) {
      console.error(err)
      audioFeedback.playErrorBuzz()
    } finally {
      setSavingItemId(null)
    }
  }

  async function handlePickAll(item: PickItem) {
    const remaining = item.requiredQty - item.pickedQty
    if (remaining > 0) {
      await handlePickIncrement(item, remaining)
    }
  }

  async function handleConfirmShortPick(payload: {
    itemId: string
    actualPickedQty: number
    shortQty: number
    reason: string
    action: "backorder" | "cancel" | "alternate_bin"
    alternateBin?: string
  }) {
    if (!activePick) return
    const diff = payload.actualPickedQty - (shortPickItem?.pickedQty || 0)
    if (diff !== 0) {
      await onUpdatePickItem(activePick.id, payload.itemId, diff)
    }
    setSuccessMsg(`✓ Short pick logged (${payload.reason}) — Action: ${payload.action}`)
    setShortPickItem(null)
    onRefresh()
  }

  function handleBarcodeScan(scannedCode: string) {
    if (!activePick) {
      const matched = pickLists.find((p) =>
        p.items.some((it) => it.sku.toLowerCase() === scannedCode.toLowerCase())
      )
      if (matched) {
        setSelectedPick(matched)
        setScanMessage(`Opened Pick List #${matched.pickNumber}`)
      } else {
        setScanMessage(`SKU ${scannedCode} not found in active pick lists.`)
        audioFeedback.playErrorBuzz()
      }
      return
    }

    const matchedItem = activePick.items.find(
      (it) => it.sku.toLowerCase() === scannedCode.toLowerCase()
    )

    if (matchedItem) {
      if (matchedItem.pickedQty < matchedItem.requiredQty) {
        void handlePickIncrement(matchedItem, 1)
        setScanMessage(`✓ Scanned & Picked: ${matchedItem.productName} (+1)`)
        audioFeedback.playSuccessChime()
      } else {
        setScanMessage(`Item ${matchedItem.sku} is already fully picked (${matchedItem.pickedQty}/${matchedItem.requiredQty})`)
      }
    } else {
      setScanMessage(`SKU "${scannedCode}" not found in current pick list #${activePick.pickNumber}`)
      audioFeedback.playErrorBuzz()
    }
  }

  async function handleCompletePacking(packPayload: {
    orderId: string
    totalCartons: number
    totalWeight: number
  }) {
    if (onPackOrder) {
      await onPackOrder(packPayload.orderId, {
        status: "packed",
        totalCartons: packPayload.totalCartons,
        totalWeight: packPayload.totalWeight,
      })
    }
    setSuccessMsg(`✓ Order packed into ${packPayload.totalCartons} cartons and staged for dispatch!`)
    setPackingOrder(null)
    onRefresh()
  }

  const pendingCount = pickLists.filter((p) => p.status === "pending").length
  const inProgressCount = pickLists.filter((p) => p.status === "in_progress").length
  const completedCount = pickLists.filter((p) => p.status === "completed").length

  return (
    <div className={styles.mainContent}>
      {/* Apple Hero Tile Alternate: Dark Tile */}
      <section className={styles.heroDarkTile}>
        <div className={styles.heroHeaderStack}>
          <span className={styles.heroTagline}>Fulfillment & Cartonization</span>
          <h1 className={styles.heroDisplay}>
            {activePick ? `Pick List #${activePick.pickNumber}` : "Order Picking & Packing Station"}
          </h1>
          <p className={styles.heroLead}>
            {activePick
              ? `${activePick.customerName} • Order ${activePick.orderNumber}`
              : `${pickLists.length} Total pick lists active on warehouse floor`}
          </p>
        </div>

        {/* Apple Stat Strip */}
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Pending</span>
            <span className={styles.statValue}>{pendingCount}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>In Progress</span>
            <span className={styles.statValue} style={{ color: "var(--primary-on-dark)" }}>
              {inProgressCount}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Completed</span>
            <span className={styles.statValue} style={{ color: "#34d399" }}>
              {completedCount}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Units</span>
            <span className={styles.statValue}>
              {pickLists.reduce((sum, p) => sum + p.items.reduce((s, it) => s + it.requiredQty, 0), 0)}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px" }}>
          {activePick ? (
            <div className={styles.pillGroup}>
              <button
                type="button"
                onClick={() => setViewTab("items")}
                className={viewTab === "items" ? styles.optionChipSelected : styles.optionChip}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                Line Items
              </button>
              <button
                type="button"
                onClick={() => setViewTab("map")}
                className={viewTab === "map" ? styles.optionChipSelected : styles.optionChip}
                style={{ padding: "6px 14px", fontSize: "13px" }}
              >
                <Map size={13} style={{ display: "inline", marginRight: "4px" }} />
                <span>Bin Map & Path</span>
              </button>
            </div>
          ) : (
            <div />
          )}

          <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className={styles.buttonPrimary}
              style={{ padding: "8px 18px", fontSize: "14px" }}
            >
              <ScanLine size={15} />
              <span>Scan Barcode</span>
            </button>

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

      {scanMessage && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--canvas)",
            border: "1px solid var(--primary)",
            borderRadius: "11px",
            color: "var(--primary)",
            fontSize: "14px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{scanMessage}</span>
          <button
            type="button"
            onClick={() => setScanMessage(null)}
            style={{ background: "none", border: "none", color: "var(--ink-muted-48)", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Guided Item Picking View */}
      {activePick ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => setSelectedPick(null)}
              className={styles.buttonSecondaryPill}
              style={{ padding: "8px 16px", fontSize: "14px" }}
            >
              ← Back to All Pick Lists
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className={styles.cardTagHighlight}>
                {activePick.progress}% Picked
              </span>

              <button
                type="button"
                onClick={() => setPackingOrder(activePick)}
                className={styles.buttonPrimary}
                style={{ padding: "8px 16px", fontSize: "14px" }}
              >
                <Package size={14} />
                <span>Pack Cartons</span>
              </button>
            </div>
          </div>

          {viewTab === "map" ? (
            <WarehouseBinMap
              activePickList={activePick}
              onSelectBin={(binCode) => {
                setViewTab("items")
                audioFeedback.playSuccessChime()
              }}
            />
          ) : (
            <div className={styles.cardGrid}>
              {activePick.items.map((item) => {
                const isItemDone = item.pickedQty >= item.requiredQty
                const isBusy = savingItemId === item.id

                return (
                  <div
                    key={item.id}
                    className={`${styles.utilityCard} ${isItemDone ? styles.utilityCardDone : ""}`}
                  >
                    <div className={styles.cardHeaderRow}>
                      <span className={styles.cardTagHighlight}>
                        <MapPin size={12} /> {item.location || "Bin Unassigned"}
                      </span>
                      <span className={styles.cardSequenceBadge}>{item.sku}</span>
                    </div>

                    <div>
                      <h3 className={styles.cardTitle}>{item.productName}</h3>
                      <p className={styles.cardSub}>
                        Target: {item.requiredQty} Units | Picked: {item.pickedQty}
                      </p>
                    </div>

                    {/* Pick Progress & Quick Buttons */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingTop: "12px",
                        borderTop: "1px solid var(--hairline)",
                      }}
                    >
                      <div>
                        <span className={styles.statLabel}>Picked Balance</span>
                        <span
                          style={{
                            display: "block",
                            fontSize: "18px",
                            fontWeight: 600,
                            color: isItemDone ? "#15803d" : "var(--primary)",
                          }}
                        >
                          {item.pickedQty} / {item.requiredQty}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "6px" }}>
                        {!isItemDone && (
                          <button
                            type="button"
                            onClick={() => setShortPickItem(item)}
                            className={styles.buttonPearlCapsule}
                            style={{ padding: "8px 10px", color: "#b91c1c" }}
                            title="Log Short Pick / Insufficient Stock in Bin"
                          >
                            <AlertTriangle size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handlePickIncrement(item, 1)}
                          disabled={isBusy || isItemDone}
                          className={styles.buttonPearlCapsule}
                          style={{ padding: "8px 12px" }}
                        >
                          <Plus size={13} />
                          <span>1</span>
                        </button>

                        {item.requiredQty > 5 && (
                          <button
                            type="button"
                            onClick={() => handlePickIncrement(item, 5)}
                            disabled={isBusy || isItemDone || item.pickedQty + 5 > item.requiredQty}
                            className={styles.buttonPearlCapsule}
                            style={{ padding: "8px 12px" }}
                          >
                            <Plus size={13} />
                            <span>5</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handlePickAll(item)}
                          disabled={isBusy || isItemDone}
                          className={styles.buttonPrimary}
                          style={{ padding: "8px 16px", fontSize: "14px" }}
                        >
                          <Check size={14} />
                          <span>All</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* Pick Lists Queue */
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className={styles.searchContainer}>
              <Search size={18} className={styles.searchIcon} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by pick #, order #, customer, SKU..."
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
                All ({pickLists.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className={statusFilter === "pending" ? styles.optionChipSelected : styles.optionChip}
              >
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("in_progress")}
                className={statusFilter === "in_progress" ? styles.optionChipSelected : styles.optionChip}
              >
                In Progress ({inProgressCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("completed")}
                className={statusFilter === "completed" ? styles.optionChipSelected : styles.optionChip}
              >
                Completed ({completedCount})
              </button>
            </div>
          </div>

          <div className={styles.cardGrid}>
            {filteredPickLists.length === 0 ? (
              <div className={styles.utilityCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
                <p style={{ margin: 0, color: "var(--ink-muted-48)" }}>No pick lists match your filter.</p>
              </div>
            ) : (
              filteredPickLists.map((pick) => {
                const isCompleted = pick.status === "completed"
                const isHighPriority = pick.priority === "high"

                return (
                  <div
                    key={pick.id}
                    className={`${styles.utilityCard} ${isCompleted ? styles.utilityCardDone : ""}`}
                  >
                    <div className={styles.cardHeaderRow}>
                      <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        <span className={styles.cardSequenceBadge}>#{pick.pickNumber}</span>
                        {isHighPriority && <span className={styles.cardTagHighlight}>Priority</span>}
                      </div>

                      <span className={isCompleted ? styles.cardTagHighlight : styles.cardTag}>
                        {pick.status.replace("_", " ")}
                      </span>
                    </div>

                    <div>
                      <h3 className={styles.cardTitle}>{pick.customerName}</h3>
                      <p className={styles.cardSub}>
                        Order {pick.orderNumber} • {pick.warehouseName}
                      </p>
                    </div>

                    <div className={styles.cardMetadataRow}>
                      <span className={styles.cardTag}>
                        <Package size={13} /> {pick.items.length} Line Items
                      </span>
                      <span className={styles.cardTag}>
                        <Clock size={13} /> {pick.progress}% Picked
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", paddingTop: "12px", borderTop: "1px solid var(--hairline)" }}>
                      <button
                        type="button"
                        onClick={() => setSelectedPick(pick)}
                        className={styles.buttonPrimary}
                        style={{ flex: 1, padding: "8px 14px", fontSize: "13px" }}
                      >
                        <span>{isCompleted ? "View Pick" : "Guided Pick"}</span>
                        <ChevronRight size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => setPackingOrder(pick)}
                        className={styles.buttonPearlCapsule}
                        style={{ padding: "8px 14px", fontSize: "13px" }}
                      >
                        <Package size={14} />
                        <span>Pack Box</span>
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Barcode Scanner Modal */}
      <ScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScan}
        title={activePick ? `Pick Scan - #${activePick.pickNumber}` : "Scan Product / Pick List"}
        hint="Align barcode within viewfinder or laser scan SKU"
      />

      {/* Carton Packing Station Modal */}
      {packingOrder && (
        <CartonPackingStationModal
          isOpen={Boolean(packingOrder)}
          onClose={() => setPackingOrder(null)}
          order={{
            id: packingOrder.orderId,
            orderNumber: packingOrder.orderNumber,
            customerName: packingOrder.customerName,
            deliveryAddress: "Sydney DC / Regional Delivery",
            items: packingOrder.items.map((it) => ({
              id: it.id,
              productId: it.productId,
              productName: it.productName,
              sku: it.sku,
              pickedQty: it.pickedQty,
            })),
          }}
          onCompletePacking={handleCompletePacking}
        />
      )}

      {/* Short Pick Resolution Modal */}
      {shortPickItem && (
        <ShortPickModal
          isOpen={Boolean(shortPickItem)}
          onClose={() => setShortPickItem(null)}
          item={shortPickItem}
          onConfirmShortPick={handleConfirmShortPick}
        />
      )}
    </div>
  )
}
