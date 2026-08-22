"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Filter,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { ScannerModal } from "../ui/ScannerModal"
import styles from "../../page.module.css"

export interface InventoryItem {
  id: string
  productId: string
  warehouseId: string
  quantity: number
  allocated: number
  reorderLevel: number
  location?: string | null
  isLowStock?: boolean
  product: {
    id: string
    name: string
    sku: string
    baseUnit: string
    category?: {
      name: string
    } | null
  }
  warehouse: {
    id: string
    name: string
  }
}

interface WarehouseInventoryViewProps {
  inventory: InventoryItem[]
  loading: boolean
  onRefresh: () => void
  onAdjustStock: (
    productId: string,
    warehouseId: string,
    type: "adjustment" | "in" | "out",
    quantity: number,
    notes: string
  ) => Promise<void>
}

export function WarehouseInventoryView({
  inventory,
  loading,
  onRefresh,
  onAdjustStock,
}: WarehouseInventoryViewProps) {
  const [search, setSearch] = useState("")
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [adjustmentType, setAdjustmentType] = useState<"in" | "out" | "adjustment">("adjustment")
  const [adjustQty, setAdjustQty] = useState<number>(0)
  const [adjustReason, setAdjustReason] = useState("Cycle Count Correction")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const matchesSearch =
        search === "" ||
        item.product.name.toLowerCase().includes(search.toLowerCase()) ||
        item.product.sku.toLowerCase().includes(search.toLowerCase()) ||
        (item.location && item.location.toLowerCase().includes(search.toLowerCase())) ||
        (item.product.category?.name &&
          item.product.category.name.toLowerCase().includes(search.toLowerCase()))

      if (!matchesSearch) return false
      if (filterLowStock && !item.isLowStock) return false

      return true
    })
  }, [inventory, search, filterLowStock])

  function openAdjustmentModal(item: InventoryItem) {
    setSelectedItem(item)
    setAdjustQty(item.quantity)
    setAdjustmentType("adjustment")
    setAdjustReason("Cycle Count Correction")
    setError(null)
  }

  async function handleSaveAdjustment() {
    if (!selectedItem) return

    try {
      setSaving(true)
      setError(null)

      let deltaOrNewQty = adjustQty
      if (adjustmentType === "in") {
        deltaOrNewQty = Math.abs(adjustQty)
      } else if (adjustmentType === "out") {
        deltaOrNewQty = Math.abs(adjustQty)
      }

      await onAdjustStock(
        selectedItem.productId,
        selectedItem.warehouseId,
        adjustmentType,
        deltaOrNewQty,
        adjustReason.trim() || "Manual adjustment"
      )

      audioFeedback.playSuccessChime()
      setSuccessMsg(`✓ Stock updated for ${selectedItem.product.name}`)
      setSelectedItem(null)
      onRefresh()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to update stock")
      audioFeedback.playErrorBuzz()
    } finally {
      setSaving(false)
    }
  }

  function handleBarcodeScan(scannedCode: string) {
    const matched = inventory.find(
      (item) => item.product.sku.toLowerCase() === scannedCode.toLowerCase()
    )
    if (matched) {
      setSelectedItem(matched)
      setAdjustQty(matched.quantity)
      audioFeedback.playSuccessChime()
    } else {
      setSearch(scannedCode)
      audioFeedback.playScanBeep()
    }
  }

  const lowStockCount = inventory.filter((item) => item.isLowStock).length
  const totalUnits = inventory.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <div className={styles.routeContainer}>
      {/* Header Card */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryTop}>
          <div>
            <span className={styles.badgePrimary}>Warehouse Floor</span>
            <h2 className={styles.summaryTitle}>Live Stock & Bin Lookup</h2>
            <p className={styles.summarySub}>{inventory.length} Stock Keeping Units (SKUs)</p>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className={styles.scannerTriggerBtn}
              title="Scan SKU Barcode"
            >
              <ScanLine size={18} />
              <span>Scan</span>
            </button>
            <button type="button" onClick={onRefresh} disabled={loading} className={styles.iconBtn}>
              <RefreshCw size={18} className={loading ? styles.spin : ""} />
            </button>
          </div>
        </div>

        <div className={styles.metricsGrid}>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Total Stock</span>
            <span className={styles.metricNumber} style={{ color: "#38bdf8" }}>
              {totalUnits}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>SKU Count</span>
            <span className={styles.metricNumber}>{inventory.length}</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Low Stock Alerts</span>
            <span className={styles.metricNumber} style={{ color: lowStockCount > 0 ? "#f87171" : "#34d399" }}>
              {lowStockCount}
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

      {/* Search & Filter */}
      <div className={styles.filterSection}>
        <div className={styles.searchBar}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product name, SKU, bin location..."
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
            onClick={() => setFilterLowStock(false)}
            className={!filterLowStock ? styles.activePill : styles.pill}
          >
            All Products ({inventory.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterLowStock(true)}
            className={filterLowStock ? styles.activePill : styles.pill}
          >
            Low Stock ({lowStockCount})
          </button>
        </div>
      </div>

      {/* Inventory Items List */}
      <div className={styles.stopsList}>
        {filteredInventory.length === 0 ? (
          <div className={styles.emptySearchCard}>
            <p>No products match your search.</p>
          </div>
        ) : (
          filteredInventory.map((item) => {
            const available = Math.max(0, item.quantity - (item.allocated || 0))

            return (
              <div
                key={item.id}
                className={`${styles.stopCard} ${item.isLowStock ? styles.stopWarning : ""}`}
              >
                <div className={styles.stopCardTop}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className={styles.skuTag}>{item.product.sku}</span>
                    {item.location && (
                      <span className={styles.binLocationTag}>
                        <MapPin size={12} /> {item.location}
                      </span>
                    )}
                  </div>
                  {item.isLowStock && <span className={styles.badgeDanger}>Low Stock</span>}
                </div>

                <h3 className={styles.stopCustomerName} style={{ marginTop: "4px" }}>
                  {item.product.name}
                </h3>
                <p className={styles.stopOrderMeta}>
                  {item.product.category?.name || "General"} • {item.warehouse.name}
                </p>

                {/* Stock Stats Grid */}
                <div className={styles.detailGrid} style={{ marginTop: "8px" }}>
                  <div className={styles.detailGridItem}>
                    <span className={styles.blockLabel}>On Hand</span>
                    <span className={styles.detailGridValue}>{item.quantity}</span>
                  </div>
                  <div className={styles.detailGridItem}>
                    <span className={styles.blockLabel}>Allocated</span>
                    <span className={styles.detailGridValue} style={{ color: "#fbbf24" }}>
                      {item.allocated || 0}
                    </span>
                  </div>
                  <div className={styles.detailGridItem}>
                    <span className={styles.blockLabel}>Available</span>
                    <span className={styles.detailGridValue} style={{ color: "#34d399" }}>
                      {available} {item.product.baseUnit}
                    </span>
                  </div>
                  <div className={styles.detailGridItem}>
                    <span className={styles.blockLabel}>Reorder Point</span>
                    <span className={styles.detailGridValue}>{item.reorderLevel}</span>
                  </div>
                </div>

                <div className={styles.stopActionRow}>
                  <button
                    type="button"
                    onClick={() => openAdjustmentModal(item)}
                    className={styles.actionBtnPrimary}
                    style={{ width: "100%", justifyContent: "center" }}
                  >
                    <ArrowDownUp size={15} />
                    <span>Quick Adjust Stock / Count</span>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Stock Adjustment Modal */}
      {selectedItem && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.skuTag}>{selectedItem.product.sku}</span>
                <h3 className={styles.modalTitle}>{selectedItem.product.name}</h3>
                <p className={styles.modalSub}>Current On Hand: {selectedItem.quantity} {selectedItem.product.baseUnit}</p>
              </div>
              <button type="button" onClick={() => setSelectedItem(null)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {error && <div className={styles.errorBanner}>{error}</div>}

              {/* Adjustment Mode Selector */}
              <div className={styles.pillGroup} style={{ marginBottom: "14px" }}>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType("adjustment")
                    setAdjustQty(selectedItem.quantity)
                  }}
                  className={adjustmentType === "adjustment" ? styles.activePill : styles.pill}
                >
                  Set Count
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType("in")
                    setAdjustQty(1)
                  }}
                  className={adjustmentType === "in" ? styles.activePill : styles.pill}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType("out")
                    setAdjustQty(1)
                  }}
                  className={adjustmentType === "out" ? styles.activePill : styles.pill}
                >
                  - Remove Stock
                </button>
              </div>

              {/* Quantity Input */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  {adjustmentType === "adjustment"
                    ? "New Counted Total"
                    : adjustmentType === "in"
                    ? "Quantity to Add"
                    : "Quantity to Remove"}
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setAdjustQty((q) => Math.max(0, q - 1))}
                    className={styles.secondaryBtn}
                    style={{ padding: "10px 14px" }}
                  >
                    <Minus size={16} />
                  </button>

                  <input
                    type="number"
                    min={0}
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Number(e.target.value) || 0)}
                    className={styles.textInput}
                    style={{ textAlign: "center", fontSize: "18px", fontWeight: 700 }}
                  />

                  <button
                    type="button"
                    onClick={() => setAdjustQty((q) => q + 1)}
                    className={styles.secondaryBtn}
                    style={{ padding: "10px 14px" }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {/* Reason Selector */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Reason for Adjustment</label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className={styles.selectInput}
                >
                  <option value="Cycle Count Correction">Cycle Count Correction</option>
                  <option value="Damaged Goods / Spoilage">Damaged Goods / Spoilage</option>
                  <option value="Found Uncounted Stock">Found Uncounted Stock</option>
                  <option value="Internal Use / Quality Check">Internal Use / Quality Check</option>
                  <option value="Stock Relocation">Stock Relocation</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className={styles.secondaryBtn}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdjustment}
                  disabled={saving}
                  className={styles.primaryBtn}
                  style={{ flex: 2 }}
                >
                  <CheckCircle2 size={18} />
                  <span>{saving ? "Updating..." : "Save Adjustment"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barcode Scanner Modal */}
      <ScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScan}
        title="Scan Product SKU"
        hint="Scan barcode to locate item in inventory"
      />
    </div>
  )
}
