"use client"

import { useMemo, useState } from "react"
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Filter,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  SlidersHorizontal,
  Sparkles,
  Truck,
  User,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { ScannerModal } from "../ui/ScannerModal"
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
}

export function WarehousePickingView({
  pickLists,
  loading,
  onRefresh,
  onUpdatePickItem,
}: WarehousePickingViewProps) {
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedPick, setSelectedPick] = useState<PickList | null>(null)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [savingItemId, setSavingItemId] = useState<string | null>(null)
  const [scanMessage, setScanMessage] = useState<string | null>(null)

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

  // Sync selected pick if pickLists updates
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

  function handleBarcodeScan(scannedCode: string) {
    if (!activePick) {
      // Find matching pick list
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

    // Match item in active pick list
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

  const pendingCount = pickLists.filter((p) => p.status === "pending").length
  const inProgressCount = pickLists.filter((p) => p.status === "in_progress").length
  const completedCount = pickLists.filter((p) => p.status === "completed").length

  return (
    <div className={styles.routeContainer}>
      {/* Pick List Overview / Active Pick Header */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryTop}>
          <div>
            <span className={styles.badgePrimary}>Warehouse Fulfillment</span>
            <h2 className={styles.summaryTitle}>
              {activePick ? `Pick List #${activePick.pickNumber}` : "Order Picking Queue"}
            </h2>
            <p className={styles.summarySub}>
              {activePick
                ? `${activePick.customerName} • Order ${activePick.orderNumber}`
                : `${pickLists.length} Total Pick Lists in Warehouse`}
            </p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className={styles.scannerTriggerBtn}
              title="Open Barcode Scanner"
            >
              <ScanLine size={18} />
              <span>Scan</span>
            </button>
            <button type="button" onClick={onRefresh} disabled={loading} className={styles.iconBtn}>
              <RefreshCw size={18} className={loading ? styles.spin : ""} />
            </button>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className={styles.metricsGrid}>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Pending</span>
            <span className={styles.metricNumber} style={{ color: "#fbbf24" }}>
              {pendingCount}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>In Progress</span>
            <span className={styles.metricNumber} style={{ color: "#38bdf8" }}>
              {inProgressCount}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Completed</span>
            <span className={styles.metricNumber} style={{ color: "#34d399" }}>
              {completedCount}
            </span>
          </div>
        </div>
      </div>

      {scanMessage && (
        <div
          style={{
            background: "rgba(56, 189, 248, 0.15)",
            border: "1px solid rgba(56, 189, 248, 0.3)",
            borderRadius: "10px",
            padding: "10px 14px",
            color: "#38bdf8",
            fontSize: "13px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{scanMessage}</span>
          <button
            type="button"
            onClick={() => setScanMessage(null)}
            style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* If an active pick list is selected: Render Guided Item Picking View */}
      {activePick ? (
        <div className={styles.pickingDetailContainer}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <button
              type="button"
              onClick={() => setSelectedPick(null)}
              className={styles.secondaryBtn}
              style={{ padding: "8px 14px", fontSize: "13px" }}
            >
              ← Back to All Pick Lists
            </button>

            <span
              className={
                activePick.status === "completed"
                  ? styles.statusPillSuccess
                  : activePick.status === "in_progress"
                  ? styles.statusPillInfo
                  : styles.statusPillWarning
              }
            >
              {activePick.status.replace("_", " ")}
            </span>
          </div>

          {/* Progress Bar */}
          <div className={styles.progressSection} style={{ marginBottom: "16px" }}>
            <div className={styles.progressHeader}>
              <span>Pick List Progress</span>
              <span className={styles.progressValue}>{activePick.progress}% Complete</span>
            </div>
            <div className={styles.progressBarBg}>
              <div className={styles.progressBarFill} style={{ width: `${activePick.progress}%` }} />
            </div>
          </div>

          {/* Item List */}
          <div className={styles.stopsList}>
            {activePick.items.map((item) => {
              const isItemDone = item.pickedQty >= item.requiredQty
              const isBusy = savingItemId === item.id

              return (
                <div
                  key={item.id}
                  className={`${styles.pickItemCard} ${isItemDone ? styles.pickItemDone : ""}`}
                >
                  <div className={styles.pickItemTop}>
                    <div className={styles.binLocationTag}>
                      <MapPin size={13} />
                      <span>{item.location || "Bin Unassigned"}</span>
                    </div>
                    <span className={styles.skuTag}>{item.sku}</span>
                  </div>

                  <h3 className={styles.pickItemName}>{item.productName}</h3>

                  <div className={styles.pickQtyRow}>
                    <div className={styles.pickQtyDisplay}>
                      <span className={styles.pickQtyLabel}>Picked:</span>
                      <span
                        className={styles.pickQtyValue}
                        style={{ color: isItemDone ? "#34d399" : "#38bdf8" }}
                      >
                        {item.pickedQty} / {item.requiredQty}
                      </span>
                    </div>

                    {/* Quick increment buttons */}
                    <div className={styles.pickActionButtons}>
                      <button
                        type="button"
                        onClick={() => handlePickIncrement(item, 1)}
                        disabled={isBusy || isItemDone}
                        className={styles.pickIncrementBtn}
                      >
                        <Plus size={14} />
                        <span>1</span>
                      </button>

                      {item.requiredQty > 5 && (
                        <button
                          type="button"
                          onClick={() => handlePickIncrement(item, 5)}
                          disabled={isBusy || isItemDone || item.pickedQty + 5 > item.requiredQty}
                          className={styles.pickIncrementBtn}
                        >
                          <Plus size={14} />
                          <span>5</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handlePickAll(item)}
                        disabled={isBusy || isItemDone}
                        className={styles.pickAllBtn}
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
        </div>
      ) : (
        /* Pick Lists Queue */
        <>
          <div className={styles.filterSection}>
            <div className={styles.searchBar}>
              <Search size={16} className={styles.searchIcon} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by pick #, order #, customer, SKU..."
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
                All ({pickLists.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className={statusFilter === "pending" ? styles.activePill : styles.pill}
              >
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("in_progress")}
                className={statusFilter === "in_progress" ? styles.activePill : styles.pill}
              >
                In Progress ({inProgressCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("completed")}
                className={statusFilter === "completed" ? styles.activePill : styles.pill}
              >
                Completed ({completedCount})
              </button>
            </div>
          </div>

          <div className={styles.stopsList}>
            {filteredPickLists.length === 0 ? (
              <div className={styles.emptySearchCard}>
                <p>No pick lists match your filter.</p>
              </div>
            ) : (
              filteredPickLists.map((pick) => {
                const isCompleted = pick.status === "completed"
                const isHighPriority = pick.priority === "high"

                return (
                  <div
                    key={pick.id}
                    onClick={() => setSelectedPick(pick)}
                    className={`${styles.stopCard} ${isCompleted ? styles.stopDelivered : ""}`}
                    style={{ cursor: "pointer" }}
                  >
                    <div className={styles.stopCardTop}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className={styles.badgePrimary}>#{pick.pickNumber}</span>
                        {isHighPriority && <span className={styles.badgeDanger}>Urgent</span>}
                      </div>

                      <span
                        className={
                          isCompleted
                            ? styles.statusPillSuccess
                            : pick.status === "in_progress"
                            ? styles.statusPillInfo
                            : styles.statusPillWarning
                        }
                      >
                        {pick.status.replace("_", " ")}
                      </span>
                    </div>

                    <div style={{ marginTop: "4px" }}>
                      <h3 className={styles.stopCustomerName}>{pick.customerName}</h3>
                      <p className={styles.stopOrderMeta}>
                        Order {pick.orderNumber} • {pick.warehouseName}
                      </p>
                    </div>

                    <div className={styles.stopMetricsRow}>
                      <div className={styles.stopMetricTag}>
                        <Package size={14} />
                        <span>{pick.items.length} Line Items</span>
                      </div>
                      <div className={styles.stopMetricTag}>
                        <Clock size={14} />
                        <span>Progress: {pick.progress}%</span>
                      </div>
                    </div>

                    <div style={{ marginTop: "10px" }}>
                      <div className={styles.progressBarBg}>
                        <div
                          className={styles.progressBarFill}
                          style={{
                            width: `${pick.progress}%`,
                            background: isCompleted ? "#10b981" : "#38bdf8",
                          }}
                        />
                      </div>
                    </div>

                    <div className={styles.stopActionRow}>
                      <button
                        type="button"
                        className={styles.actionBtnPrimary}
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        <span>{isCompleted ? "View Pick Details" : "Start Picking"}</span>
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

      {/* Barcode Scanner Modal */}
      <ScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScan}
        title={activePick ? `Pick Scan - #${activePick.pickNumber}` : "Scan Product / Pick List"}
        hint="Point camera at item SKU barcode or enter code"
      />
    </div>
  )
}
