"use client"

import { useMemo, useState } from "react"
import {
  ArrowDownUp,
  CheckCircle2,
  MapPin,
  Minus,
  Plus,
  RefreshCw,
  ScanLine,
  Search,
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
  const [newLocation, setNewLocation] = useState("")
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
    setNewLocation(item.location || "")
    setError(null)
  }

  async function handleSaveAdjustment() {
    if (!selectedItem) return

    try {
      setSaving(true)
      setError(null)

      let deltaOrNewQty = adjustQty
      if (adjustmentType === "in" || adjustmentType === "out") {
        deltaOrNewQty = Math.abs(adjustQty)
      }

      const reasonText =
        adjustReason === "Bin Relocation" && newLocation.trim()
          ? `Bin Relocation to ${newLocation.trim().toUpperCase()}`
          : adjustReason.trim() || "Manual count correction"

      await onAdjustStock(
        selectedItem.productId,
        selectedItem.warehouseId,
        adjustmentType,
        deltaOrNewQty,
        reasonText
      )

      audioFeedback.playSuccessChime()
      setSuccessMsg(`✓ Stock balance updated for ${selectedItem.product.name}`)
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
    <div className={styles.mainContent}>
      {/* Apple Hero Tile Alternate: Dark Tile */}
      <section className={styles.heroDarkTile}>
        <div className={styles.heroHeaderStack}>
          <span className={styles.heroTagline}>Inventory Master</span>
          <h1 className={styles.heroDisplay}>Stock & Bin Locator</h1>
          <p className={styles.heroLead}>
            {inventory.length} Stock Keeping Units active across warehouse zones
          </p>
        </div>

        {/* Apple Stat Strip */}
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Stock</span>
            <span className={styles.statValue}>{totalUnits}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Active SKUs</span>
            <span className={styles.statValue}>{inventory.length}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Low Stock Alerts</span>
            <span className={styles.statValue} style={{ color: lowStockCount > 0 ? "var(--primary-on-dark)" : "#34d399" }}>
              {lowStockCount}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className={styles.buttonPrimary}
            style={{ padding: "8px 18px", fontSize: "14px" }}
          >
            <ScanLine size={15} />
            <span>Scan SKU</span>
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

      {/* Search & Option Chips */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div className={styles.searchContainer}>
          <Search size={18} className={styles.searchIcon} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by SKU, name, bin location..."
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
            onClick={() => setFilterLowStock(false)}
            className={!filterLowStock ? styles.optionChipSelected : styles.optionChip}
          >
            All Stock Items ({inventory.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterLowStock(true)}
            className={filterLowStock ? styles.optionChipSelected : styles.optionChip}
          >
            Low Stock Alerts ({lowStockCount})
          </button>
        </div>
      </div>

      {/* Store Utility Card Grid */}
      <div className={styles.cardGrid}>
        {filteredInventory.length === 0 ? (
          <div className={styles.utilityCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
            <p style={{ margin: 0, color: "var(--ink-muted-48)" }}>No inventory items match your search.</p>
          </div>
        ) : (
          filteredInventory.map((item) => {
            const available = Math.max(0, item.quantity - (item.allocated || 0))

            return (
              <div key={item.id} className={styles.utilityCard}>
                <div className={styles.cardHeaderRow}>
                  <span className={styles.cardSequenceBadge}>{item.product.sku}</span>
                  {item.location && (
                    <span className={styles.cardTagHighlight}>
                      <MapPin size={12} /> {item.location}
                    </span>
                  )}
                  {item.isLowStock && <span className={styles.cardTag} style={{ color: "#b91c1c" }}>Low Stock</span>}
                </div>

                <div>
                  <h3 className={styles.cardTitle}>{item.product.name}</h3>
                  <p className={styles.cardSub}>
                    {item.product.category?.name || "General"} • {item.warehouse.name}
                  </p>
                </div>

                {/* Stock Stats Grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", background: "var(--canvas-parchment)", padding: "12px", borderRadius: "11px" }}>
                  <div>
                    <span className={styles.statLabel}>On Hand</span>
                    <span style={{ display: "block", fontSize: "16px", fontWeight: 600, color: "var(--ink)", marginTop: "2px" }}>
                      {item.quantity}
                    </span>
                  </div>
                  <div>
                    <span className={styles.statLabel}>Allocated</span>
                    <span style={{ display: "block", fontSize: "16px", fontWeight: 600, color: "var(--ink-muted-80)", marginTop: "2px" }}>
                      {item.allocated || 0}
                    </span>
                  </div>
                  <div>
                    <span className={styles.statLabel}>Available</span>
                    <span style={{ display: "block", fontSize: "16px", fontWeight: 600, color: "var(--primary)", marginTop: "2px" }}>
                      {available} {item.product.baseUnit}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
                  <button
                    type="button"
                    onClick={() => openAdjustmentModal(item)}
                    className={styles.buttonPrimary}
                    style={{ width: "100%", padding: "10px", fontSize: "14px" }}
                  >
                    <ArrowDownUp size={15} />
                    <span>Quick Adjust Stock Count</span>
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
                <span className={styles.cardSequenceBadge}>{selectedItem.product.sku}</span>
                <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
                  {selectedItem.product.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
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

              {/* Adjustment Mode Selector */}
              <div className={styles.pillGroup}>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType("adjustment")
                    setAdjustQty(selectedItem.quantity)
                  }}
                  className={adjustmentType === "adjustment" ? styles.optionChipSelected : styles.optionChip}
                >
                  Set Counted Balance
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType("in")
                    setAdjustQty(1)
                  }}
                  className={adjustmentType === "in" ? styles.optionChipSelected : styles.optionChip}
                >
                  + Add Units
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdjustmentType("out")
                    setAdjustQty(1)
                  }}
                  className={adjustmentType === "out" ? styles.optionChipSelected : styles.optionChip}
                >
                  - Remove Units
                </button>
              </div>

              {/* Quantity Input */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>
                  {adjustmentType === "adjustment"
                    ? "New Count Total"
                    : adjustmentType === "in"
                    ? "Quantity to Add"
                    : "Quantity to Remove"}
                </label>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button
                    type="button"
                    onClick={() => setAdjustQty((q) => Math.max(0, q - 1))}
                    className={styles.buttonPearlCapsule}
                    style={{ padding: "12px 16px" }}
                  >
                    <Minus size={16} />
                  </button>

                  <input
                    type="number"
                    min={0}
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(Number(e.target.value) || 0)}
                    className={styles.textInput}
                    style={{ textAlign: "center", fontSize: "20px", fontWeight: 600 }}
                  />

                  <button
                    type="button"
                    onClick={() => setAdjustQty((q) => q + 1)}
                    className={styles.buttonPearlCapsule}
                    style={{ padding: "12px 16px" }}
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
                  <option value="Internal Quality Inspection">Internal Quality Inspection</option>
                  <option value="Bin Relocation">Bin Relocation</option>
                </select>
              </div>

              {adjustReason === "Bin Relocation" && (
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>New Bin / Aisle Location</label>
                  <input
                    type="text"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="e.g. CR-01, AISLE-B-02, STAGE-01"
                    className={styles.textInput}
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className={styles.buttonSecondaryPill}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAdjustment}
                  disabled={saving}
                  className={styles.buttonPrimary}
                  style={{ flex: 2 }}
                >
                  <CheckCircle2 size={17} />
                  <span>{saving ? "Saving..." : "Save Adjustment"}</span>
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
        hint="Scan barcode to instantly locate item in inventory"
      />
    </div>
  )
}
