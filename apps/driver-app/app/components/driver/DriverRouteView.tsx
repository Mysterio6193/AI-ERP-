"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  Calculator,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  ExternalLink,
  Layers,
  Map,
  MapPin,
  Navigation,
  Package,
  Phone,
  Receipt,
  RefreshCw,
  Search,
  ShieldCheck,
  Thermometer,
  Truck,
  X,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { PhotoCapture } from "../ui/PhotoCapture"
import { SignaturePad } from "../ui/SignaturePad"
import { DriverRouteMap } from "./DriverRouteMap"
import { VehicleInspectionModal } from "./VehicleInspectionModal"
import { DriverCheckoutModal } from "./DriverCheckoutModal"
import styles from "../../page.module.css"

export interface StopLineItem {
  id: string
  productId: string
  productName: string
  sku: string
  baseUnit: string
  quantity: number
  unitPrice: number
  totalPrice: number
}

export interface RouteStop {
  id: string
  orderId?: string | null
  orderNumber: string
  deliveryNumber: string
  customerName: string
  customerEmail?: string | null
  address: string
  city: string
  state: string
  postcode: string
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  status: string
  scheduledDate: string
  scheduledTime?: string | null
  etaLabel?: string | null
  receivedBy?: string | null
  codAmount: number
  codCollected: boolean
  notes?: string | null
  photoUrl?: string | null
  signatureUrl?: string | null
  exceptionReason?: string | null
  exceptionPhotoUrl?: string | null
  rescheduleRequested?: boolean
  deliveryInstructions?: string | null
  items: number
  weight: number
  sequence: number
  latitude?: number | null
  longitude?: number | null
  enRouteAt?: string | null
  arrivedAt?: string | null
  deliveredAt?: string | null
  failedAt?: string | null
  lineItems?: StopLineItem[]
}

export interface DriverRoute {
  id: string
  routeNumber: string
  name: string
  routeDate: string
  driverId?: string | null
  driverName: string
  driverPhone?: string | null
  driverAvatar?: string | null
  vehicle: string
  warehouseName: string
  status: string
  startTime?: string | null
  endTime?: string | null
  totalStops: number
  completedStops: number
  failedStops: number
  remainingStops: number
  totalDistance: number
  totalWeight: number
  progress: number
  nextStopId?: string | null
  outstandingCod: number
  stops: RouteStop[]
}

interface DriverRouteViewProps {
  route: DriverRoute | null
  loading: boolean
  onRefresh: () => void
  onUpdateStop: (stopId: string, payload: Record<string, unknown>) => Promise<void>
  onSubmitException: (stopId: string, payload: Record<string, unknown>) => Promise<void>
}

const EXCEPTION_REASONS = [
  "Customer Unavailable / Business Closed",
  "Incorrect or Incomplete Address",
  "Refused Delivery by Customer",
  "Payment / COD Discrepancy",
  "Damaged Goods",
  "Access Restriction / Gate Locked",
  "Other Exception",
]

function formatMoney(amount: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(amount)
}

function fullAddress(stop: RouteStop) {
  return [stop.address, stop.city, stop.state, stop.postcode].filter(Boolean).join(", ")
}

function navUrl(stop: RouteStop) {
  if (stop.latitude && stop.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress(stop))}`
}

export function DriverRouteView({
  route,
  loading,
  onRefresh,
  onUpdateStop,
  onSubmitException,
}: DriverRouteViewProps) {
  const [viewMode, setViewMode] = useState<"cards" | "map">("cards")
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [activeModal, setActiveModal] = useState<"detail" | "pod" | "exception" | null>(null)
  const [dvirOpen, setDvirOpen] = useState(false)
  const [dvirCompleted, setDvirCompleted] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Unloading Checklist items
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})

  // Payment Breakdown State
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "account">("cash")
  const [cashTendered, setCashTendered] = useState<string>("")

  // POD Form State
  const [podData, setPodData] = useState({
    receivedBy: "",
    notes: "",
    codCollected: false,
    photoUrl: "",
    signatureUrl: "",
  })

  // Exception Form State
  const [exceptionData, setExceptionData] = useState({
    exceptionReason: EXCEPTION_REASONS[0],
    notes: "",
    rescheduleRequested: false,
    exceptionPhotoUrl: "",
  })

  const stops = route?.stops || []

  const filteredStops = useMemo(() => {
    return stops.filter((stop) => {
      const matchesSearch =
        search === "" ||
        stop.customerName.toLowerCase().includes(search.toLowerCase()) ||
        stop.address.toLowerCase().includes(search.toLowerCase()) ||
        stop.deliveryNumber.toLowerCase().includes(search.toLowerCase()) ||
        stop.orderNumber.toLowerCase().includes(search.toLowerCase())

      if (!matchesSearch) return false

      if (statusFilter === "pending") {
        return stop.status === "pending" || stop.status === "en_route" || stop.status === "arrived"
      }
      if (statusFilter === "completed") {
        return stop.status === "delivered"
      }
      if (statusFilter === "exceptions") {
        return stop.status === "failed" || stop.status === "returned" || stop.status === "exception"
      }

      return true
    })
  }, [stops, search, statusFilter])

  function openStopDetail(stop: RouteStop) {
    setSelectedStop(stop)
    setPodData({
      receivedBy: stop.receivedBy || stop.contactName || stop.customerName,
      notes: stop.notes || "",
      codCollected: stop.codCollected,
      photoUrl: stop.photoUrl || "",
      signatureUrl: stop.signatureUrl || "",
    })
    setExceptionData({
      exceptionReason: stop.exceptionReason || EXCEPTION_REASONS[0],
      notes: stop.notes || "",
      rescheduleRequested: stop.rescheduleRequested || false,
      exceptionPhotoUrl: stop.exceptionPhotoUrl || "",
    })
    setCashTendered(stop.codAmount ? String(stop.codAmount) : "")

    const initialChecklist: Record<string, boolean> = {}
    stop.lineItems?.forEach((item) => {
      initialChecklist[item.id] = true
    })
    setCheckedItems(initialChecklist)

    setActiveModal("detail")
  }

  async function handleQuickStatusChange(stop: RouteStop, nextStatus: "en_route" | "arrived") {
    // DVIR Compliance Gate
    if (!dvirCompleted && nextStatus === "en_route") {
      setDvirOpen(true)
      return
    }

    try {
      setSaving(true)
      setError(null)
      await onUpdateStop(stop.id, { status: nextStatus })
      audioFeedback.playPickBeep()
      if (selectedStop?.id === stop.id) {
        setSelectedStop((prev) => (prev ? { ...prev, status: nextStatus } : null))
      }
    } catch (err) {
      console.error(err)
      setError("Failed to update status")
    } finally {
      setSaving(false)
    }
  }

  async function handleCompletePod() {
    if (!selectedStop) return
    if (!podData.receivedBy.trim()) {
      setError("Please enter the recipient name.")
      return
    }

    try {
      setSaving(true)
      setError(null)
      await onUpdateStop(selectedStop.id, {
        status: "delivered",
        receivedBy: podData.receivedBy.trim(),
        notes: podData.notes.trim() || undefined,
        codCollected: podData.codCollected,
        photoUrl: podData.photoUrl || undefined,
        signatureUrl: podData.signatureUrl || undefined,
        paymentMethod,
      })

      audioFeedback.playSuccessChime()
      setSuccessMsg(`✓ Delivery completed for ${selectedStop.customerName}!`)
      setActiveModal(null)
      setSelectedStop(null)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to submit Proof of Delivery")
    } finally {
      setSaving(false)
    }
  }

  async function handleSubmitExceptionForm() {
    if (!selectedStop) return

    try {
      setSaving(true)
      setError(null)
      await onSubmitException(selectedStop.id, {
        exceptionReason: exceptionData.exceptionReason,
        notes: exceptionData.notes.trim() || undefined,
        rescheduleRequested: exceptionData.rescheduleRequested,
        exceptionPhotoUrl: exceptionData.exceptionPhotoUrl || undefined,
      })

      audioFeedback.playErrorBuzz()
      setSuccessMsg(`✓ Exception logged for ${selectedStop.customerName}`)
      setActiveModal(null)
      setSelectedStop(null)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to record delivery exception")
    } finally {
      setSaving(false)
    }
  }

  async function handleDriverCheckoutComplete(summary: Record<string, unknown>) {
    setSuccessMsg(`✓ Shift closed out! Cash reconciled (Variance: ${formatMoney(Number(summary.cashDiscrepancy) || 0)})`)
    onRefresh()
  }

  if (!route) {
    return (
      <div className={styles.mainContent}>
        <div className={styles.utilityCard} style={{ textAlign: "center", padding: "64px 32px" }}>
          <Truck size={44} style={{ color: "var(--ink-muted-48)", margin: "0 auto 16px auto" }} />
          <h2 className={styles.heroDisplay} style={{ fontSize: "28px" }}>No Active Run Assigned</h2>
          <p className={styles.heroLeadLight} style={{ fontSize: "17px", marginTop: "8px" }}>
            You currently do not have a run sheet assigned for today. Contact warehouse dispatch or refresh.
          </p>
          <div style={{ marginTop: "24px", display: "flex", justifyContent: "center" }}>
            <button type="button" onClick={onRefresh} className={styles.buttonPrimary}>
              <RefreshCw size={16} />
              <span>Refresh Run Sheet</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  const completedCount = stops.filter((s) => s.status === "delivered").length
  const totalCount = stops.length
  const totalCod = stops.reduce((sum, s) => sum + (s.codAmount || 0), 0)

  // Change Calculation
  const tenderedNum = Number(cashTendered) || 0
  const stopCod = selectedStop?.codAmount || 0
  const changeDue = Math.max(0, tenderedNum - stopCod)

  return (
    <div className={styles.mainContent}>
      {/* Apple Product Tile Alternate: Dark Tile Hero */}
      <section className={styles.heroDarkTile}>
        <div className={styles.heroHeaderStack}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span className={styles.heroTagline}>Run #{route.routeNumber}</span>
            <div style={{ display: "flex", gap: "8px" }}>
              {dvirCompleted ? (
                <span style={{ fontSize: "12px", color: "#34d399", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <ShieldCheck size={14} /> DVIR Certified
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setDvirOpen(true)}
                  className={styles.buttonPearlCapsule}
                  style={{ padding: "4px 10px", fontSize: "12px" }}
                >
                  <ShieldCheck size={13} />
                  <span>Pre-Trip DVIR</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                className={styles.buttonPearlCapsule}
                style={{ padding: "4px 10px", fontSize: "12px" }}
              >
                <Receipt size={13} />
                <span>Shift Checkout</span>
              </button>
            </div>
          </div>

          <h1 className={styles.heroDisplay}>{route.name || "Daily Distribution Route"}</h1>
          <p className={styles.heroLead}>
            {route.warehouseName} • {route.vehicle || "Distribution Van"}
          </p>
        </div>

        {/* Apple Stat Strip */}
        <div className={styles.statStrip}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Total Stops</span>
            <span className={styles.statValue}>{totalCount}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Completed</span>
            <span className={styles.statValue} style={{ color: "#34d399" }}>
              {completedCount}
            </span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Remaining</span>
            <span className={styles.statValue}>{totalCount - completedCount}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>COD Value</span>
            <span className={styles.statValue} style={{ color: "var(--primary-on-dark)" }}>
              {formatMoney(totalCod)}
            </span>
          </div>
        </div>

        {/* Action Controls & Map Switcher */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "8px" }}>
          <div className={styles.pillGroup}>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={viewMode === "cards" ? styles.optionChipSelected : styles.optionChip}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              List View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              className={viewMode === "map" ? styles.optionChipSelected : styles.optionChip}
              style={{ padding: "6px 14px", fontSize: "13px" }}
            >
              <Map size={13} style={{ display: "inline", marginRight: "4px" }} />
              <span>Route Map</span>
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

      {/* Interactive Map View */}
      {viewMode === "map" ? (
        <DriverRouteMap route={route} onSelectStop={openStopDetail} />
      ) : (
        /* Card List View */
        <>
          {/* Search & Option Chips */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div className={styles.searchContainer}>
              <Search size={18} className={styles.searchIcon} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stops by customer, address, or consignment..."
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
                All Stops ({stops.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("pending")}
                className={statusFilter === "pending" ? styles.optionChipSelected : styles.optionChip}
              >
                Pending ({stops.filter((s) => s.status !== "delivered" && s.status !== "failed").length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("completed")}
                className={statusFilter === "completed" ? styles.optionChipSelected : styles.optionChip}
              >
                Delivered ({completedCount})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("exceptions")}
                className={statusFilter === "exceptions" ? styles.optionChipSelected : styles.optionChip}
              >
                Exceptions ({stops.filter((s) => s.status === "failed" || s.status === "returned").length})
              </button>
            </div>
          </div>

          {/* Stop Cards */}
          <div className={styles.cardGrid}>
            {filteredStops.length === 0 ? (
              <div className={styles.utilityCard} style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px" }}>
                <p style={{ margin: 0, color: "var(--ink-muted-48)" }}>No matching delivery stops found.</p>
              </div>
            ) : (
              filteredStops.map((stop, idx) => {
                const isDelivered = stop.status === "delivered"
                const isFailed = stop.status === "failed" || stop.status === "returned"

                return (
                  <div
                    key={stop.id}
                    className={`${styles.utilityCard} ${isDelivered ? styles.utilityCardDone : ""}`}
                  >
                    <div className={styles.cardHeaderRow}>
                      <span className={styles.cardSequenceBadge}>Stop #{stop.sequence || idx + 1}</span>
                      <span
                        className={
                          isDelivered
                            ? styles.cardTagHighlight
                            : isFailed
                            ? styles.cardTag
                            : styles.cardTag
                        }
                      >
                        {isDelivered ? "Delivered ✓" : stop.status.replace("_", " ")}
                      </span>
                    </div>

                    <div>
                      <h3 className={styles.cardTitle}>{stop.customerName}</h3>
                      <p className={styles.cardSub}>
                        Consignment {stop.deliveryNumber} • Order {stop.orderNumber}
                      </p>
                    </div>

                    <div className={styles.cardAddress}>
                      <MapPin size={16} style={{ flexShrink: 0, marginTop: "2px", color: "var(--ink-muted-48)" }} />
                      <span>{fullAddress(stop)}</span>
                    </div>

                    {stop.deliveryInstructions && (
                      <div
                        style={{
                          background: "var(--canvas-parchment)",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          fontSize: "14px",
                          color: "var(--ink-muted-80)",
                        }}
                      >
                        <span>Instruction: {stop.deliveryInstructions}</span>
                      </div>
                    )}

                    <div className={styles.cardMetadataRow}>
                      <span className={styles.cardTag}>
                        <Package size={13} /> {stop.items} Cartons
                      </span>
                      {stop.codAmount > 0 && (
                        <span className={styles.cardTagHighlight}>
                          <DollarSign size={13} /> COD: {formatMoney(stop.codAmount)}
                        </span>
                      )}
                      {stop.etaLabel && (
                        <span className={styles.cardTag}>
                          <Clock size={13} /> {stop.etaLabel}
                        </span>
                      )}
                    </div>

                    {/* Card Action Row */}
                    <div style={{ display: "flex", gap: "8px", marginTop: "8px", paddingTop: "12px", borderTop: "1px solid var(--hairline)" }}>
                      <a
                        href={navUrl(stop)}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.buttonPearlCapsule}
                      >
                        <Navigation size={14} />
                        <span>Navigate</span>
                      </a>

                      {stop.contactPhone && (
                        <a
                          href={`tel:${stop.contactPhone}`}
                          className={styles.buttonPearlCapsule}
                        >
                          <Phone size={14} />
                          <span>Call</span>
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => openStopDetail(stop)}
                        className={styles.buttonPrimary}
                        style={{ marginLeft: "auto", padding: "8px 18px", fontSize: "14px" }}
                      >
                        <span>{isDelivered ? "View POD" : isFailed ? "Exception" : "Actions"}</span>
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Stop Detail & Execution Modal */}
      {activeModal === "detail" && selectedStop && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.cardSequenceBadge}>Stop #{selectedStop.sequence}</span>
                <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
                  {selectedStop.customerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className={styles.buttonIconCircular}
                style={{ width: "32px", height: "32px" }}
              >
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Destination Address */}
              <div className={styles.utilityCard} style={{ padding: "16px", background: "var(--canvas-parchment)" }}>
                <span className={styles.statLabel}>Delivery Destination</span>
                <p className={styles.cardTitle} style={{ marginTop: "4px", fontSize: "16px" }}>
                  {fullAddress(selectedStop)}
                </p>
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <a
                    href={navUrl(selectedStop)}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.buttonSecondaryPill}
                    style={{ flex: 1, padding: "8px 14px", fontSize: "14px" }}
                  >
                    <Navigation size={14} />
                    <span>Open Maps Navigation</span>
                  </a>
                  {selectedStop.contactPhone && (
                    <a
                      href={`tel:${selectedStop.contactPhone}`}
                      className={styles.buttonPearlCapsule}
                      style={{ padding: "8px 14px" }}
                    >
                      <Phone size={14} />
                      <span>Call Contact</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Item-by-Item Cargo Unloading Checklist */}
              {selectedStop.lineItems && selectedStop.lineItems.length > 0 && (
                <div className={styles.utilityCard} style={{ padding: "16px" }}>
                  <div className={styles.cardHeaderRow}>
                    <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
                      Cargo Unloading Checklist ({selectedStop.lineItems.length} items)
                    </h4>
                    <span className={styles.statLabel}>Tap box to verify</span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
                    {selectedStop.lineItems.map((item) => {
                      const isChecked = checkedItems[item.id] ?? true
                      return (
                        <div
                          key={item.id}
                          onClick={() => {
                            setCheckedItems((prev) => ({ ...prev, [item.id]: !isChecked }))
                            audioFeedback.playPickBeep()
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            background: isChecked ? "var(--canvas-parchment)" : "#fef2f2",
                            border: isChecked ? "1px solid var(--hairline)" : "1px solid #fecaca",
                            borderRadius: "8px",
                            cursor: "pointer",
                          }}
                        >
                          <div>
                            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                              {item.productName}
                            </span>
                            <span style={{ display: "block", fontSize: "12px", color: "var(--ink-muted-48)" }}>
                              SKU: {item.sku}
                            </span>
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--primary)" }}>
                              {item.quantity} {item.baseUnit}
                            </span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              readOnly
                              style={{ width: "18px", height: "18px", accentColor: "var(--primary)" }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Status Progression Controls */}
              {selectedStop.status !== "delivered" && selectedStop.status !== "failed" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "4px" }}>
                  <span className={styles.statLabel}>Step Progression</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <button
                      type="button"
                      onClick={() => handleQuickStatusChange(selectedStop, "en_route")}
                      disabled={saving || selectedStop.status === "en_route" || selectedStop.status === "arrived"}
                      className={selectedStop.status === "en_route" ? styles.buttonPrimary : styles.buttonSecondaryPill}
                      style={{ padding: "10px 14px", fontSize: "14px" }}
                    >
                      <Truck size={15} />
                      <span>En Route</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickStatusChange(selectedStop, "arrived")}
                      disabled={saving || selectedStop.status === "arrived"}
                      className={selectedStop.status === "arrived" ? styles.buttonPrimary : styles.buttonSecondaryPill}
                      style={{ padding: "10px 14px", fontSize: "14px" }}
                    >
                      <MapPin size={15} />
                      <span>Arrived at Site</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                    <button
                      type="button"
                      onClick={() => setActiveModal("pod")}
                      className={styles.buttonPrimary}
                      style={{ flex: 2, padding: "14px 22px" }}
                    >
                      <CheckCircle2 size={18} />
                      <span>Complete Delivery (POD)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModal("exception")}
                      className={styles.buttonSecondaryPill}
                      style={{ flex: 1, padding: "14px 18px", color: "var(--ink-muted-80)", borderColor: "var(--hairline)" }}
                    >
                      <AlertTriangle size={16} />
                      <span>Exception</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Already Delivered View */}
              {selectedStop.status === "delivered" && (
                <div className={styles.utilityCard} style={{ background: "var(--surface-pearl)", padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#15803d" }}>
                    <ShieldCheck size={20} />
                    <h4 style={{ margin: 0, fontSize: "17px", fontWeight: 600 }}>Proof of Delivery Recorded</h4>
                  </div>
                  <p style={{ margin: "8px 0 0 0", fontSize: "15px", color: "var(--ink-muted-80)" }}>
                    Received by: <strong>{selectedStop.receivedBy || "Authorized Representative"}</strong>
                  </p>
                  {selectedStop.signatureUrl && (
                    <div style={{ marginTop: "12px" }}>
                      <span className={styles.statLabel}>Recipient Signature</span>
                      <div className={styles.productImageContainer} style={{ padding: "8px 0" }}>
                        <img
                          src={selectedStop.signatureUrl}
                          alt="Signature"
                          className={styles.productImageShadow}
                          style={{ maxHeight: "90px", background: "#ffffff", padding: "8px", border: "1px solid var(--hairline)" }}
                        />
                      </div>
                    </div>
                  )}
                  {selectedStop.photoUrl && (
                    <div style={{ marginTop: "12px" }}>
                      <span className={styles.statLabel}>Drop-off Photo</span>
                      <div className={styles.productImageContainer}>
                        <img
                          src={selectedStop.photoUrl}
                          alt="Drop-off Proof"
                          className={styles.productImageShadow}
                          style={{ maxHeight: "160px" }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proof of Delivery (POD) Modal with Payment Breakdown */}
      {activeModal === "pod" && selectedStop && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.heroTaglineLight}>Proof of Delivery</span>
                <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
                  {selectedStop.customerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal("detail")}
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

              {/* Recipient Name */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Recipient Name *</label>
                <input
                  type="text"
                  value={podData.receivedBy}
                  onChange={(e) => setPodData((prev) => ({ ...prev, receivedBy: e.target.value }))}
                  placeholder="e.g. Sarah Jenkins"
                  className={styles.textInput}
                />
              </div>

              {/* COD Payment & Change Calculator */}
              {selectedStop.codAmount > 0 && (
                <div className={styles.utilityCard} style={{ background: "var(--canvas-parchment)", padding: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className={styles.statLabel}>COD Balance Due</span>
                    <span style={{ fontSize: "18px", fontWeight: 600, color: "var(--primary)" }}>
                      {formatMoney(selectedStop.codAmount)}
                    </span>
                  </div>

                  <div className={styles.pillGroup} style={{ marginTop: "10px" }}>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("cash")}
                      className={paymentMethod === "cash" ? styles.optionChipSelected : styles.optionChip}
                    >
                      <DollarSign size={13} style={{ display: "inline" }} /> Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("card")}
                      className={paymentMethod === "card" ? styles.optionChipSelected : styles.optionChip}
                    >
                      <CreditCard size={13} style={{ display: "inline" }} /> EFTPOS / Card
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod("account")}
                      className={paymentMethod === "account" ? styles.optionChipSelected : styles.optionChip}
                    >
                      Account on File
                    </button>
                  </div>

                  {paymentMethod === "cash" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "10px" }}>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Cash Tendered ($)</label>
                        <input
                          type="number"
                          value={cashTendered}
                          onChange={(e) => setCashTendered(e.target.value)}
                          className={styles.textInput}
                        />
                      </div>
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>Change Due</label>
                        <div
                          style={{
                            padding: "12px",
                            background: "var(--canvas)",
                            border: "1px solid var(--hairline)",
                            borderRadius: "11px",
                            fontSize: "17px",
                            fontWeight: 600,
                            color: changeDue > 0 ? "#15803d" : "var(--ink)",
                          }}
                        >
                          {formatMoney(changeDue)}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "12px" }}>
                    <input
                      type="checkbox"
                      id="codCheck"
                      checked={podData.codCollected}
                      onChange={(e) => setPodData((prev) => ({ ...prev, codCollected: e.target.checked }))}
                      style={{ width: "18px", height: "18px", accentColor: "var(--primary)", cursor: "pointer" }}
                    />
                    <label htmlFor="codCheck" style={{ fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
                      Payment Collected in Full
                    </label>
                  </div>
                </div>
              )}

              {/* Drop-off Photo */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Package Drop-off Photo</label>
                <PhotoCapture
                  value={podData.photoUrl}
                  onChange={(url) => setPodData((prev) => ({ ...prev, photoUrl: url }))}
                  label="Take Drop-off Photo"
                  purpose="pod_photo"
                />
              </div>

              {/* Signature Pad */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Recipient Signature</label>
                <SignaturePad
                  initialValue={podData.signatureUrl}
                  onSave={(dataUrl) => setPodData((prev) => ({ ...prev, signatureUrl: dataUrl }))}
                />
              </div>

              {/* Delivery Notes */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Delivery Notes (Optional)</label>
                <textarea
                  value={podData.notes}
                  onChange={(e) => setPodData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Left safely inside kitchen door with head chef"
                  rows={2}
                  className={styles.textArea}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setActiveModal("detail")}
                  className={styles.buttonSecondaryPill}
                  style={{ flex: 1 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCompletePod}
                  disabled={saving || !podData.receivedBy.trim()}
                  className={styles.buttonPrimary}
                  style={{ flex: 2 }}
                >
                  <CheckCircle2 size={17} />
                  <span>{saving ? "Confirming..." : "Confirm Delivery"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Exception Modal */}
      {activeModal === "exception" && selectedStop && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.statLabel} style={{ color: "#b91c1c" }}>Exception Report</span>
                <h3 className={styles.modalTitle} style={{ marginTop: "4px" }}>
                  {selectedStop.customerName}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal("detail")}
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
                <label className={styles.formLabel}>Exception Reason *</label>
                <select
                  value={exceptionData.exceptionReason}
                  onChange={(e) => setExceptionData((prev) => ({ ...prev, exceptionReason: e.target.value }))}
                  className={styles.selectInput}
                >
                  {EXCEPTION_REASONS.map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  background: "var(--canvas-parchment)",
                  borderRadius: "11px",
                  border: "1px solid var(--hairline)",
                }}
              >
                <div>
                  <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>Request Reschedule</span>
                  <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-muted-48)" }}>
                    Notify dispatch to re-route for next delivery window
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={exceptionData.rescheduleRequested}
                  onChange={(e) =>
                    setExceptionData((prev) => ({ ...prev, rescheduleRequested: e.target.checked }))
                  }
                  style={{ width: "18px", height: "18px", accentColor: "var(--primary)", cursor: "pointer" }}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Photo Evidence (Optional)</label>
                <PhotoCapture
                  value={exceptionData.exceptionPhotoUrl}
                  onChange={(url) => setExceptionData((prev) => ({ ...prev, exceptionPhotoUrl: url }))}
                  label="Take Photo of Premises"
                  purpose="exception_photo"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Driver Notes</label>
                <textarea
                  value={exceptionData.notes}
                  onChange={(e) => setExceptionData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Premises closed, gate locked, no answer on telephone"
                  rows={3}
                  className={styles.textArea}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setActiveModal("detail")}
                  className={styles.buttonSecondaryPill}
                  style={{ flex: 1 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmitExceptionForm}
                  disabled={saving}
                  className={styles.buttonPrimary}
                  style={{ flex: 2, background: "var(--ink)" }}
                >
                  <AlertTriangle size={16} />
                  <span>{saving ? "Recording..." : "Submit Exception"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Trip / Post-Trip DVIR Modal */}
      <VehicleInspectionModal
        isOpen={dvirOpen}
        onClose={() => setDvirOpen(false)}
        vehicleId={route.vehicle}
        driverName={route.driverName}
        onComplete={() => {
          setDvirCompleted(true)
          setSuccessMsg("✓ Pre-trip inspection certified. Route unlocked!")
        }}
      />

      {/* End of Shift Checkout Modal */}
      {checkoutOpen && (
        <DriverCheckoutModal
          isOpen={checkoutOpen}
          onClose={() => setCheckoutOpen(false)}
          route={route}
          onCompleteCheckout={handleDriverCheckoutComplete}
        />
      )}
    </div>
  )
}
