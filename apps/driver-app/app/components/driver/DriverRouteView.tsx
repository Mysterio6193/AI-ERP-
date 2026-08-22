"use client"

import { useMemo, useState } from "react"
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  FileSignature,
  Filter,
  MapPin,
  Navigation,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Truck,
  User,
  X,
  XCircle,
} from "lucide-react"
import { audioFeedback } from "../ui/AudioFeedback"
import { PhotoCapture } from "../ui/PhotoCapture"
import { SignaturePad } from "../ui/SignaturePad"
import styles from "../../page.module.css"

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
  "Incorrect / Incomplete Address",
  "Refused by Customer",
  "Payment / COD Issue",
  "Damaged Goods on Vehicle",
  "Access / Security Restriction",
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
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null)
  const [activeModal, setActiveModal] = useState<"detail" | "pod" | "exception" | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setActiveModal("detail")
  }

  async function handleQuickStatusChange(stop: RouteStop, nextStatus: "en_route" | "arrived") {
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
      })

      audioFeedback.playSuccessChime()
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
      setActiveModal(null)
      setSelectedStop(null)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to record delivery exception")
    } finally {
      setSaving(false)
    }
  }

  if (!route) {
    return (
      <div className={styles.emptyCard}>
        <Truck size={40} className={styles.emptyIcon} />
        <h3>No Assigned Route Today</h3>
        <p>You currently don't have an active delivery route assigned. Check with dispatch or refresh.</p>
        <button type="button" onClick={onRefresh} className={styles.primaryBtn} style={{ marginTop: "12px" }}>
          <RefreshCw size={16} />
          <span>Refresh Route</span>
        </button>
      </div>
    )
  }

  const completedCount = stops.filter((s) => s.status === "delivered").length
  const totalCount = stops.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const totalCod = stops.reduce((sum, s) => sum + (s.codAmount || 0), 0)

  return (
    <div className={styles.routeContainer}>
      {/* Route Header Card */}
      <div className={styles.summaryCard}>
        <div className={styles.summaryTop}>
          <div>
            <span className={styles.badgePrimary}>{route.routeNumber}</span>
            <h2 className={styles.summaryTitle}>{route.name || "Daily Distribution Run"}</h2>
            <p className={styles.summarySub}>
              {route.warehouseName} • {route.vehicle || "Standard Van"}
            </p>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} className={styles.iconBtn}>
            <RefreshCw size={18} className={loading ? styles.spin : ""} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span>Run Progress</span>
            <span className={styles.progressValue}>
              {completedCount}/{totalCount} Stops ({progressPercent}%)
            </span>
          </div>
          <div className={styles.progressBarBg}>
            <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Metrics Grid */}
        <div className={styles.metricsGrid}>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Total Stops</span>
            <span className={styles.metricNumber}>{totalCount}</span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Completed</span>
            <span className={styles.metricNumber} style={{ color: "#34d399" }}>
              {completedCount}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Remaining</span>
            <span className={styles.metricNumber} style={{ color: "#38bdf8" }}>
              {totalCount - completedCount}
            </span>
          </div>
          <div className={styles.metricItem}>
            <span className={styles.metricLabel}>Total COD</span>
            <span className={styles.metricNumber} style={{ color: "#facc15" }}>
              {formatMoney(totalCod)}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Status Filters */}
      <div className={styles.filterSection}>
        <div className={styles.searchBar}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search stops, customers, address..."
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
            All ({stops.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={statusFilter === "pending" ? styles.activePill : styles.pill}
          >
            Pending ({stops.filter((s) => s.status !== "delivered" && s.status !== "failed").length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("completed")}
            className={statusFilter === "completed" ? styles.activePill : styles.pill}
          >
            Delivered ({completedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("exceptions")}
            className={statusFilter === "exceptions" ? styles.activePill : styles.pill}
          >
            Exceptions ({stops.filter((s) => s.status === "failed" || s.status === "returned").length})
          </button>
        </div>
      </div>

      {/* Stop Cards List */}
      <div className={styles.stopsList}>
        {filteredStops.length === 0 ? (
          <div className={styles.emptySearchCard}>
            <p>No matching stops found.</p>
          </div>
        ) : (
          filteredStops.map((stop, idx) => {
            const isDelivered = stop.status === "delivered"
            const isFailed = stop.status === "failed" || stop.status === "returned"
            const isEnRoute = stop.status === "en_route"
            const isArrived = stop.status === "arrived"

            return (
              <div
                key={stop.id}
                className={`${styles.stopCard} ${isDelivered ? styles.stopDelivered : isFailed ? styles.stopFailed : isArrived ? styles.stopArrived : isEnRoute ? styles.stopEnRoute : ""}`}
              >
                <div className={styles.stopCardTop}>
                  <div className={styles.stopSequenceBadge}>#{stop.sequence || idx + 1}</div>
                  <div className={styles.stopHeaderInfo}>
                    <h3 className={styles.stopCustomerName}>{stop.customerName}</h3>
                    <p className={styles.stopOrderMeta}>
                      {stop.deliveryNumber} • {stop.orderNumber}
                    </p>
                  </div>
                  <span
                    className={
                      isDelivered
                        ? styles.statusPillSuccess
                        : isFailed
                        ? styles.statusPillDanger
                        : isArrived
                        ? styles.statusPillInfo
                        : isEnRoute
                        ? styles.statusPillWarning
                        : styles.statusPillDefault
                    }
                  >
                    {stop.status.replace("_", " ")}
                  </span>
                </div>

                <div className={styles.stopAddressRow}>
                  <MapPin size={16} className={styles.stopIcon} />
                  <span>{fullAddress(stop)}</span>
                </div>

                {stop.deliveryInstructions && (
                  <div className={styles.stopInstructionBox}>
                    <span>💡 {stop.deliveryInstructions}</span>
                  </div>
                )}

                <div className={styles.stopMetricsRow}>
                  <div className={styles.stopMetricTag}>
                    <Package size={14} />
                    <span>{stop.items} items</span>
                  </div>
                  {stop.codAmount > 0 && (
                    <div className={styles.stopMetricTag} style={{ color: stop.codCollected ? "#34d399" : "#fbbf24" }}>
                      <DollarSign size={14} />
                      <span>
                        COD: {formatMoney(stop.codAmount)} {stop.codCollected ? "✓ Paid" : "(Collect)"}
                      </span>
                    </div>
                  )}
                  {stop.etaLabel && (
                    <div className={styles.stopMetricTag}>
                      <Clock size={14} />
                      <span>{stop.etaLabel}</span>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className={styles.stopActionRow}>
                  <a
                    href={navUrl(stop)}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.actionBtnSecondary}
                    title="Open Maps"
                  >
                    <Navigation size={15} />
                    <span>Navigate</span>
                  </a>

                  {stop.contactPhone && (
                    <a href={`tel:${stop.contactPhone}`} className={styles.actionBtnSecondary} title="Call Contact">
                      <Phone size={15} />
                      <span>Call</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => openStopDetail(stop)}
                    className={styles.actionBtnPrimary}
                  >
                    <span>{isDelivered ? "View POD" : isFailed ? "View Exception" : "Stop Actions"}</span>
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Stop Detail & Execution Modal */}
      {activeModal === "detail" && selectedStop && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.badgePrimary}>Stop #{selectedStop.sequence}</span>
                <h3 className={styles.modalTitle}>{selectedStop.customerName}</h3>
                <p className={styles.modalSub}>{selectedStop.deliveryNumber}</p>
              </div>
              <button type="button" onClick={() => setActiveModal(null)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Address & Navigation */}
              <div className={styles.detailBlock}>
                <label className={styles.blockLabel}>Delivery Address</label>
                <p className={styles.blockValue}>{fullAddress(selectedStop)}</p>
                <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                  <a
                    href={navUrl(selectedStop)}
                    target="_blank"
                    rel="noreferrer"
                    className={styles.actionBtnSecondary}
                    style={{ flex: 1 }}
                  >
                    <Navigation size={15} />
                    <span>Start Navigation</span>
                  </a>
                  {selectedStop.contactPhone && (
                    <a
                      href={`tel:${selectedStop.contactPhone}`}
                      className={styles.actionBtnSecondary}
                      style={{ flex: 1 }}
                    >
                      <Phone size={15} />
                      <span>Call Contact</span>
                    </a>
                  )}
                </div>
              </div>

              {selectedStop.deliveryInstructions && (
                <div className={styles.detailBlock}>
                  <label className={styles.blockLabel}>Special Instructions</label>
                  <p className={styles.instructionsText}>{selectedStop.deliveryInstructions}</p>
                </div>
              )}

              {/* Order Stats */}
              <div className={styles.detailGrid}>
                <div className={styles.detailGridItem}>
                  <span className={styles.blockLabel}>Items</span>
                  <span className={styles.detailGridValue}>{selectedStop.items} cartons</span>
                </div>
                <div className={styles.detailGridItem}>
                  <span className={styles.blockLabel}>Weight</span>
                  <span className={styles.detailGridValue}>{selectedStop.weight || 0} kg</span>
                </div>
                <div className={styles.detailGridItem}>
                  <span className={styles.blockLabel}>COD Amount</span>
                  <span className={styles.detailGridValue} style={{ color: "#fbbf24" }}>
                    {formatMoney(selectedStop.codAmount || 0)}
                  </span>
                </div>
                <div className={styles.detailGridItem}>
                  <span className={styles.blockLabel}>Current Status</span>
                  <span className={styles.detailGridValue} style={{ textTransform: "capitalize" }}>
                    {selectedStop.status.replace("_", " ")}
                  </span>
                </div>
              </div>

              {/* Status Progression Controls */}
              {selectedStop.status !== "delivered" && selectedStop.status !== "failed" && (
                <div className={styles.workflowSection}>
                  <label className={styles.blockLabel}>Workflow Actions</label>
                  <div className={styles.workflowGrid}>
                    <button
                      type="button"
                      onClick={() => handleQuickStatusChange(selectedStop, "en_route")}
                      disabled={saving || selectedStop.status === "en_route" || selectedStop.status === "arrived"}
                      className={selectedStop.status === "en_route" ? styles.workflowBtnActive : styles.workflowBtn}
                    >
                      <Truck size={16} />
                      <span>En Route</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickStatusChange(selectedStop, "arrived")}
                      disabled={saving || selectedStop.status === "arrived"}
                      className={selectedStop.status === "arrived" ? styles.workflowBtnActive : styles.workflowBtn}
                    >
                      <MapPin size={16} />
                      <span>Arrived at Site</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginTop: "12px" }}>
                    <button
                      type="button"
                      onClick={() => setActiveModal("pod")}
                      className={styles.deliverPrimaryBtn}
                      style={{ flex: 2 }}
                    >
                      <CheckCircle2 size={18} />
                      <span>Complete Delivery (POD)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveModal("exception")}
                      className={styles.exceptionSecondaryBtn}
                      style={{ flex: 1 }}
                    >
                      <AlertTriangle size={18} />
                      <span>Exception</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Already Delivered View */}
              {selectedStop.status === "delivered" && (
                <div className={styles.deliveredProofCard}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#34d399" }}>
                    <ShieldCheck size={20} />
                    <h4 style={{ margin: 0 }}>Proof of Delivery Captured</h4>
                  </div>
                  <p style={{ margin: "6px 0", fontSize: "13px", color: "#cbd5e1" }}>
                    Received by: <strong>{selectedStop.receivedBy || "Customer"}</strong>
                  </p>
                  {selectedStop.codAmount > 0 && (
                    <p style={{ margin: "4px 0", fontSize: "13px", color: "#fbbf24" }}>
                      COD: {formatMoney(selectedStop.codAmount)} ({selectedStop.codCollected ? "Collected" : "Pending"})
                    </p>
                  )}
                  {selectedStop.signatureUrl && (
                    <div style={{ marginTop: "8px" }}>
                      <span className={styles.blockLabel}>Signature</span>
                      <img
                        src={selectedStop.signatureUrl}
                        alt="Signature"
                        style={{
                          height: "80px",
                          background: "#0f172a",
                          borderRadius: "8px",
                          border: "1px solid rgba(255,255,255,0.1)",
                        }}
                      />
                    </div>
                  )}
                  {selectedStop.photoUrl && (
                    <div style={{ marginTop: "8px" }}>
                      <span className={styles.blockLabel}>Delivery Photo</span>
                      <img
                        src={selectedStop.photoUrl}
                        alt="Proof"
                        style={{
                          maxHeight: "140px",
                          borderRadius: "8px",
                          objectFit: "cover",
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Proof of Delivery (POD) Modal */}
      {activeModal === "pod" && selectedStop && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.badgePrimary}>POD Workflow</span>
                <h3 className={styles.modalTitle}>{selectedStop.customerName}</h3>
              </div>
              <button type="button" onClick={() => setActiveModal("detail")} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {error && <div className={styles.errorBanner}>{error}</div>}

              {/* Recipient Name */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Recipient Name *</label>
                <input
                  type="text"
                  value={podData.receivedBy}
                  onChange={(e) => setPodData((prev) => ({ ...prev, receivedBy: e.target.value }))}
                  placeholder="e.g. John Smith"
                  className={styles.textInput}
                />
              </div>

              {/* COD Collection Toggle */}
              {selectedStop.codAmount > 0 && (
                <div className={styles.codCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "#f8fafc" }}>
                        Collect COD: {formatMoney(selectedStop.codAmount)}
                      </span>
                      <p style={{ margin: 0, fontSize: "12px", color: "#94a3b8" }}>
                        Confirm payment received in full
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={podData.codCollected}
                      onChange={(e) => setPodData((prev) => ({ ...prev, codCollected: e.target.checked }))}
                      style={{ width: "20px", height: "20px", accentColor: "#10b981", cursor: "pointer" }}
                    />
                  </div>
                </div>
              )}

              {/* Drop-off Photo */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Package Drop Photo</label>
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
                  placeholder="e.g. Left behind reception counter with Sarah"
                  rows={2}
                  className={styles.textArea}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setActiveModal("detail")}
                  className={styles.secondaryBtn}
                  style={{ flex: 1 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCompletePod}
                  disabled={saving || !podData.receivedBy.trim()}
                  className={styles.primaryBtn}
                  style={{ flex: 2 }}
                >
                  <CheckCircle2 size={18} />
                  <span>{saving ? "Saving POD..." : "Confirm Delivery"}</span>
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
                <span className={styles.badgeDanger}>Report Exception</span>
                <h3 className={styles.modalTitle}>{selectedStop.customerName}</h3>
              </div>
              <button type="button" onClick={() => setActiveModal("detail")} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {error && <div className={styles.errorBanner}>{error}</div>}

              {/* Reason Selector */}
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

              {/* Reschedule Checkbox */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 14px",
                  background: "#1e293b",
                  borderRadius: "10px",
                  border: "1px solid rgba(148, 163, 184, 0.2)",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#f8fafc" }}>Request Reschedule</span>
                  <p style={{ margin: 0, fontSize: "11px", color: "#94a3b8" }}>
                    Flag for dispatch to re-route on next delivery cycle
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={exceptionData.rescheduleRequested}
                  onChange={(e) =>
                    setExceptionData((prev) => ({ ...prev, rescheduleRequested: e.target.checked }))
                  }
                  style={{ width: "18px", height: "18px", accentColor: "#f59e0b", cursor: "pointer" }}
                />
              </div>

              {/* Exception Photo */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Photo Evidence (Optional)</label>
                <PhotoCapture
                  value={exceptionData.exceptionPhotoUrl}
                  onChange={(url) => setExceptionData((prev) => ({ ...prev, exceptionPhotoUrl: url }))}
                  label="Take Photo Evidence"
                  purpose="exception_photo"
                />
              </div>

              {/* Exception Notes */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Notes / Explanation</label>
                <textarea
                  value={exceptionData.notes}
                  onChange={(e) => setExceptionData((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Premises closed, gate locked, no answer on phone"
                  rows={3}
                  className={styles.textArea}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  type="button"
                  onClick={() => setActiveModal("detail")}
                  className={styles.secondaryBtn}
                  style={{ flex: 1 }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleSubmitExceptionForm}
                  disabled={saving}
                  className={styles.dangerBtn}
                  style={{ flex: 2 }}
                >
                  <AlertTriangle size={18} />
                  <span>{saving ? "Submitting..." : "Submit Exception"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
