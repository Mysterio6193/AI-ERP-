"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock3,
  Loader2,
  LogOut,
  Mail,
  MapPinned,
  Navigation,
  Package2,
  Phone,
  RefreshCw,
  Route,
  ShieldCheck,
  Signature,
  Truck,
  User,
  Wallet,
  XCircle,
} from "lucide-react"
import styles from "./page.module.css"

interface CompanyBranding {
  name?: string | null
  tradingName?: string | null
}

interface DriverProfile {
  id: string
  name: string
  email: string
  phone?: string | null
  avatar?: string | null
  licenseNumber?: string | null
  vehicleId?: string | null
  companyId?: string | null
}

interface ActivityItem {
  at: string
  label: string
}

interface RouteStop {
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

interface DriverRoute {
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
  recentActivity: ActivityItem[]
  stops: RouteStop[]
}

interface DriverRouteResponse {
  driver: DriverProfile
  route: DriverRoute | null
}

interface StopDetail extends RouteStop {
  routeId?: string | null
  routeNumber?: string | null
  routeName?: string | null
  routeStatus?: string | null
  routeDate?: string | null
  warehouseName?: string | null
  driverPhone?: string | null
  driverAvatar?: string | null
  vehicle?: string | null
}

const POLL_INTERVAL_MS = 25000
const EXCEPTION_OPTIONS = [
  "customer unavailable",
  "address issue",
  "refused delivery",
  "payment issue",
  "vehicle/driver issue",
  "other",
]

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value)
}

function toLabel(value?: string | null) {
  return (value || "").replace(/_/g, " ")
}

function getBrandName(company?: CompanyBranding | null) {
  return company?.tradingName || company?.name || "Your Company"
}

function formatAddress(stop?: Pick<RouteStop, "address" | "city" | "state" | "postcode"> | null) {
  if (!stop) return ""
  return [stop.address, stop.city, stop.state, stop.postcode].filter(Boolean).join(", ")
}

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled"
  return new Date(value).toLocaleDateString()
}

function formatTime(value?: string | null) {
  if (!value) return ""
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })
}

function navigationHref(stop?: RouteStop | StopDetail | null) {
  if (!stop) return "#"
  if (stop.latitude && stop.longitude) {
    return `https://www.google.com/maps/search/?api=1&query=${stop.latitude},${stop.longitude}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formatAddress(stop))}`
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/core/${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
    cache: "no-store",
  })

  const data = await response.json()
  if (!response.ok || data.success === false) {
    throw new Error(data.error || "Request failed")
  }

  return data
}

export default function DriverAppPage() {
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const isDrawingRef = useRef(false)

  const [company, setCompany] = useState<CompanyBranding | null>(null)
  const [driver, setDriver] = useState<DriverProfile | null>(null)
  const [routeBundle, setRouteBundle] = useState<DriverRouteResponse | null>(null)
  const [selectedStopId, setSelectedStopId] = useState("")
  const [stopDetail, setStopDetail] = useState<StopDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [routeLoading, setRouteLoading] = useState(false)
  const [authLoading, setAuthLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authForm, setAuthForm] = useState({
    email: "",
    password: "",
  })
  const [proof, setProof] = useState({
    receivedBy: "",
    notes: "",
    codCollected: false,
    photoUrl: "",
    signatureUrl: "",
  })
  const [exceptionDraft, setExceptionDraft] = useState({
    exceptionReason: EXCEPTION_OPTIONS[0],
    notes: "",
    rescheduleRequested: false,
    exceptionPhotoUrl: "",
  })
  const [exceptionOpen, setExceptionOpen] = useState(false)

  useEffect(() => {
    void bootstrap()
  }, [])

  useEffect(() => {
    if (!driver) return
    const timer = window.setInterval(() => {
      void loadDriverRoute(false)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [driver?.id])

  const route = routeBundle?.route || null
  const stops = route?.stops || []
  const selectedStop = useMemo(() => {
    if (!stops.length) return null
    return (
      stops.find((stop) => stop.id === selectedStopId) ||
      stops.find((stop) => stop.id === route?.nextStopId) ||
      stops.find((stop) => stop.status !== "delivered" && stop.status !== "failed" && stop.status !== "returned") ||
      stops[0]
    )
  }, [route?.nextStopId, selectedStopId, stops])

  useEffect(() => {
    if (!selectedStop) {
      setStopDetail(null)
      return
    }
    setSelectedStopId(selectedStop.id)
    setProof({
      receivedBy: selectedStop.receivedBy || selectedStop.contactName || selectedStop.customerName,
      notes: selectedStop.notes || "",
      codCollected: selectedStop.codCollected,
      photoUrl: selectedStop.photoUrl || "",
      signatureUrl: selectedStop.signatureUrl || "",
    })
    setExceptionDraft((current) => ({
      ...current,
      exceptionReason: selectedStop.exceptionReason || EXCEPTION_OPTIONS[0],
      notes: selectedStop.notes || "",
      rescheduleRequested: selectedStop.rescheduleRequested || false,
      exceptionPhotoUrl: selectedStop.exceptionPhotoUrl || "",
    }))
    void loadStopDetail(selectedStop.id)
  }, [selectedStop?.id])

  useEffect(() => {
    setupSignatureCanvas()
  }, [driver, selectedStop?.id])

  async function bootstrap() {
    try {
      setLoading(true)
      setError(null)

      const companyResponse = await api<{ success: true; data: CompanyBranding }>("settings/company")
      setCompany(companyResponse.data)

      try {
        const sessionResponse = await api<{ success: true; data: DriverProfile }>("driver/session")
        setDriver(sessionResponse.data)
        setAuthForm((current) => ({
          ...current,
          email: sessionResponse.data.email,
          password: "",
        }))
        await loadDriverRoute(true)
      } catch {
        setDriver(null)
        setRouteBundle(null)
      }
    } catch (fetchError) {
      console.error(fetchError)
      setError("Unable to connect to the driver platform right now.")
    } finally {
      setLoading(false)
    }
  }

  async function loadDriverRoute(showSpinner = true) {
    if (showSpinner) setRouteLoading(true)
    try {
      setError(null)
      const response = await api<{ success: true; data: DriverRouteResponse }>("driver/route")
      setDriver(response.data.driver)
      setRouteBundle(response.data)
      const nextStopId =
        response.data.route?.nextStopId ||
        response.data.route?.stops.find((stop) => stop.status !== "delivered" && stop.status !== "failed" && stop.status !== "returned")?.id ||
        response.data.route?.stops[0]?.id ||
        ""
      setSelectedStopId((current) => current || nextStopId)
    } catch (fetchError) {
      console.error(fetchError)
      setError("Unable to load your assigned route.")
    } finally {
      if (showSpinner) setRouteLoading(false)
    }
  }

  async function loadStopDetail(stopId: string) {
    try {
      const response = await api<{ success: true; data: StopDetail }>(`driver/stops/${stopId}`)
      setStopDetail(response.data)
    } catch (fetchError) {
      console.error(fetchError)
      setStopDetail(null)
    }
  }

  async function signIn() {
    try {
      setAuthLoading(true)
      setError(null)
      const response = await api<{ success: true; data: { token: string; driver: DriverProfile } }>("driver/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(authForm),
      })
      setDriver(response.data.driver)
      await loadDriverRoute(true)
    } catch (authError) {
      console.error(authError)
      setError(authError instanceof Error ? authError.message : "Unable to sign in.")
    } finally {
      setAuthLoading(false)
    }
  }

  async function signOut() {
    try {
      setSaving(true)
      await api("driver/session", { method: "DELETE" })
      setDriver(null)
      setRouteBundle(null)
      setStopDetail(null)
      setSelectedStopId("")
      setProof({
        receivedBy: "",
        notes: "",
        codCollected: false,
        photoUrl: "",
        signatureUrl: "",
      })
    } catch (signOutError) {
      console.error(signOutError)
      setError("Unable to sign out right now.")
    } finally {
      setSaving(false)
    }
  }

  async function uploadAsset(file: File, purpose: string) {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("purpose", purpose)

    const response = await fetch("/api/core/driver/uploads", {
      method: "POST",
      body: formData,
    })

    const data = await response.json()
    if (!response.ok || data.success === false) {
      throw new Error(data.error || "Upload failed")
    }

    return data.data.url as string
  }

  async function handlePhotoSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return

    try {
      setSaving(true)
      const url = await uploadAsset(file, "delivery-photo")
      setProof((current) => ({ ...current, photoUrl: url }))
    } catch (uploadError) {
      console.error(uploadError)
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload delivery photo.")
    } finally {
      setSaving(false)
    }
  }

  async function handleExceptionPhotoSelected(fileList: FileList | null) {
    const file = fileList?.[0]
    if (!file) return

    try {
      setSaving(true)
      const url = await uploadAsset(file, "exception-photo")
      setExceptionDraft((current) => ({ ...current, exceptionPhotoUrl: url }))
    } catch (uploadError) {
      console.error(uploadError)
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload exception photo.")
    } finally {
      setSaving(false)
    }
  }

  function setupSignatureCanvas() {
    const canvas = signatureCanvasRef.current
    if (!canvas) return

    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = width * ratio
    canvas.height = height * ratio

    const context = canvas.getContext("2d")
    if (!context) return
    context.scale(ratio, ratio)
    context.lineCap = "round"
    context.lineJoin = "round"
    context.lineWidth = 2.5
    context.strokeStyle = "#0f172a"
    context.clearRect(0, 0, width, height)
  }

  function pointerPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const point = pointerPosition(event)
    isDrawingRef.current = true
    context.beginPath()
    context.moveTo(point.x, point.y)
  }

  function drawSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawingRef.current) return
    const canvas = signatureCanvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return

    const point = pointerPosition(event)
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function stopDrawing() {
    isDrawingRef.current = false
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    setProof((current) => ({ ...current, signatureUrl: "" }))
  }

  async function persistSignatureIfNeeded() {
    const canvas = signatureCanvasRef.current
    if (!canvas) return proof.signatureUrl
    const context = canvas.getContext("2d")
    if (!context) return proof.signatureUrl

    const pixelData = context.getImageData(0, 0, canvas.width, canvas.height).data
    const hasInk = pixelData.some((value, index) => index % 4 === 3 && value > 0)

    if (!hasInk) {
      return proof.signatureUrl
    }

    return new Promise<string>((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error("Unable to save signature."))
          return
        }

        try {
          const signatureFile = new File([blob], "signature.png", { type: "image/png" })
          const url = await uploadAsset(signatureFile, "signature")
          setProof((current) => ({ ...current, signatureUrl: url }))
          resolve(url)
        } catch (uploadError) {
          reject(uploadError)
        }
      }, "image/png")
    })
  }

  async function updateStop(payload: Record<string, unknown>) {
    if (!selectedStop) return
    try {
      setSaving(true)
      setError(null)
      await api(`driver/stops/${selectedStop.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })
      await loadDriverRoute(true)
      await loadStopDetail(selectedStop.id)
    } catch (updateError) {
      console.error(updateError)
      setError(updateError instanceof Error ? updateError.message : "Unable to update this stop.")
    } finally {
      setSaving(false)
    }
  }

  async function markEnRoute() {
    await updateStop({
      status: "en_route",
      notes: proof.notes || "Driver is on the way.",
    })
  }

  async function markArrived() {
    await updateStop({
      status: "arrived",
      notes: proof.notes,
    })
  }

  async function completeStop() {
    if (!selectedStop) return

    try {
      setSaving(true)
      setError(null)
      const signatureUrl = await persistSignatureIfNeeded()
      await api(`driver/stops/${selectedStop.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: "delivered",
          receivedBy: proof.receivedBy,
          notes: proof.notes,
          photoUrl: proof.photoUrl,
          signatureUrl,
          codCollected: proof.codCollected,
        }),
      })
      setExceptionOpen(false)
      await loadDriverRoute(true)
      await loadStopDetail(selectedStop.id)
    } catch (updateError) {
      console.error(updateError)
      setError(updateError instanceof Error ? updateError.message : "Unable to complete the stop.")
    } finally {
      setSaving(false)
    }
  }

  async function submitException() {
    if (!selectedStop) return
    try {
      setSaving(true)
      setError(null)
      await api(`driver/stops/${selectedStop.id}/exception`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(exceptionDraft),
      })
      setExceptionOpen(false)
      await loadDriverRoute(true)
      await loadStopDetail(selectedStop.id)
    } catch (exceptionError) {
      console.error(exceptionError)
      setError(exceptionError instanceof Error ? exceptionError.message : "Unable to submit the exception.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className={styles.page}>
        <div className={styles.centerState}>
          <Loader2 className={styles.spin} size={32} />
          <p>Loading driver mode…</p>
        </div>
      </main>
    )
  }

  if (!driver) {
    return (
      <main className={styles.page}>
        <div className={styles.authShell}>
          <section className={styles.authHero}>
            <p className={styles.eyebrow}>{getBrandName(company)} Driver Network</p>
            <h1 className={styles.authTitle}>Driver Mode</h1>
            <p className={styles.authCopy}>
              Separate mobile PWA for drivers and couriers. Sign in to see your assigned run, the next stop, proof workflow, and live delivery actions.
            </p>
            <div className={styles.authHighlights}>
              <span><Route size={14} /> Assigned route only</span>
              <span><Navigation size={14} /> Navigation handoff</span>
              <span><ShieldCheck size={14} /> Proof and exceptions</span>
            </div>
          </section>

          <section className={styles.authCard}>
            <div>
              <p className={styles.sectionEyebrow}>Driver Sign-In</p>
              <h2 className={styles.sectionTitle}>Access your shift</h2>
            </div>

            <label className={styles.field}>
              <span><Mail size={14} /> Email</span>
              <input
                className={styles.input}
                value={authForm.email}
                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="driver@yourcompany.com"
                autoComplete="email"
              />
            </label>

            <label className={styles.field}>
              <span><ShieldCheck size={14} /> Password</span>
              <input
                className={styles.input}
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </label>

            {error ? <div className={styles.error}>{error}</div> : null}

            <button
              className={styles.primaryButton}
              disabled={authLoading || !authForm.email || !authForm.password}
              onClick={() => void signIn()}
            >
              {authLoading ? <Loader2 className={styles.spin} size={18} /> : <ShieldCheck size={18} />}
              Sign in
            </button>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <div>
              <p className={styles.eyebrow}>{getBrandName(company)} Driver Network</p>
              <h1 className={styles.title}>Driver Mode</h1>
              <p className={styles.subtitle}>
                Assigned-trip workflow with live stop context, navigation handoff, proof of delivery, and exception handling built for mobile screens.
              </p>
            </div>
            <div className={styles.heroActions}>
              <button className={styles.iconButton} onClick={() => void loadDriverRoute(true)} disabled={routeLoading || saving}>
                {routeLoading ? <Loader2 size={18} className={styles.spin} /> : <RefreshCw size={18} />}
              </button>
              <button className={styles.iconButton} onClick={() => void signOut()} disabled={saving}>
                <LogOut size={18} />
              </button>
            </div>
          </div>

          <div className={styles.driverBar}>
            <div className={styles.driverIdentity}>
              <div className={styles.avatar}>
                {driver.avatar ? <img src={driver.avatar} alt={driver.name} className={styles.avatarImage} /> : driver.name.slice(0, 1)}
              </div>
              <div>
                <p className={styles.driverLabel}>Signed in as</p>
                <strong>{driver.name}</strong>
                <p className={styles.driverMeta}>
                  {driver.email}
                  {driver.phone ? ` • ${driver.phone}` : ""}
                </p>
              </div>
            </div>

            <div className={styles.shiftPill}>
              <Truck size={16} />
              {route ? `${toLabel(route.status)} shift` : "Awaiting route"}
            </div>
          </div>

          {route ? (
            <div className={styles.tripCard}>
              <div className={styles.tripHeader}>
                <div>
                  <p className={styles.tripEyebrow}>Current run</p>
                  <h2 className={styles.tripTitle}>{route.name}</h2>
                  <p className={styles.tripMeta}>
                    {route.routeNumber} • {route.warehouseName} • {route.vehicle}
                  </p>
                </div>
                <span className={`${styles.chip} ${styles[`tone${toLabel(route.status).replace(/\s+/g, "")}`] || styles.toneplanned}`}>
                  {toLabel(route.status)}
                </span>
              </div>

              <div className={styles.metricRow}>
                <div className={styles.metric}>
                  <span>Stops</span>
                  <strong>{route.totalStops}</strong>
                </div>
                <div className={styles.metric}>
                  <span>Completed</span>
                  <strong>{route.completedStops}</strong>
                </div>
                <div className={styles.metric}>
                  <span>Remaining</span>
                  <strong>{route.remainingStops}</strong>
                </div>
                <div className={styles.metric}>
                  <span>COD due</span>
                  <strong>{formatMoney(route.outstandingCod)}</strong>
                </div>
              </div>

              <div className={styles.progressWrap}>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${route.progress}%` }} />
                </div>
                <span>{route.progress}% complete</span>
              </div>

              <div className={styles.tripStrip}>
                <div className={styles.tripStripCard}>
                  <span>Route date</span>
                  <strong>{formatDate(route.routeDate)}</strong>
                </div>
                <div className={styles.tripStripCard}>
                  <span>Failed</span>
                  <strong>{route.failedStops}</strong>
                </div>
                <div className={styles.tripStripCard}>
                  <span>Weight</span>
                  <strong>{route.totalWeight.toFixed(0)} kg</strong>
                </div>
              </div>
            </div>
          ) : (
            <div className={styles.emptyHero}>
              <p>No route assigned yet.</p>
              <span>Dispatcher updates will appear here automatically.</span>
            </div>
          )}
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}

        <section className={styles.body}>
          <div className={styles.mapPanel}>
            {selectedStop ? (
              <>
                <div className={styles.mapGlow} />
                <div className={styles.liveHeader}>
                  <span className={styles.livePill}>Next actionable stop</span>
                  <span className={`${styles.chip} ${styles[`tone${toLabel(selectedStop.status).replace(/\s+/g, "")}`] || styles.tonepending}`}>
                    {toLabel(selectedStop.status)}
                  </span>
                </div>

                <h2 className={styles.stopTitle}>{selectedStop.customerName}</h2>
                <p className={styles.stopAddress}>{formatAddress(selectedStop)}</p>

                <div className={styles.quickFacts}>
                  <span><Package2 size={14} /> {selectedStop.items} items</span>
                  <span><MapPinned size={14} /> {selectedStop.weight.toFixed(0)} kg</span>
                  <span><Clock3 size={14} /> {selectedStop.etaLabel || selectedStop.scheduledTime || `Stop ${selectedStop.sequence}`}</span>
                  {selectedStop.codAmount > 0 ? <span><Wallet size={14} /> {formatMoney(selectedStop.codAmount)}</span> : null}
                </div>

                <div className={styles.liveActions}>
                  <a className={styles.bigAction} href={navigationHref(selectedStop)} target="_blank" rel="noreferrer">
                    <Navigation size={18} />
                    Navigate
                  </a>
                  {selectedStop.contactPhone ? (
                    <a className={styles.bigActionAlt} href={`tel:${selectedStop.contactPhone}`}>
                      <Phone size={18} />
                      Call
                    </a>
                  ) : null}
                </div>

                <div className={styles.liveMiniRail}>
                  <div className={styles.liveMiniCard}>
                    <span>Order</span>
                    <strong>{selectedStop.orderNumber}</strong>
                  </div>
                  <div className={styles.liveMiniCard}>
                    <span>Delivery</span>
                    <strong>{selectedStop.deliveryNumber}</strong>
                  </div>
                  <div className={styles.liveMiniCard}>
                    <span>Contact</span>
                    <strong>{selectedStop.contactName || selectedStop.customerName}</strong>
                  </div>
                </div>

                <div className={styles.mapCard}>
                  <div className={styles.pinPulse} />
                  <MapPinned size={40} />
                  <p>Navigation handoff ready</p>
                  <span>{selectedStop.deliveryInstructions || "No special delivery instructions for this stop."}</span>
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>Your next stop will appear here once a route is assigned.</div>
            )}
          </div>

          <div className={styles.sideStack}>
            <div className={styles.queuePanel}>
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.sectionEyebrow}>Today</p>
                  <h3 className={styles.sectionTitle}>Stop Queue</h3>
                </div>
                <span className={styles.queueCount}>{stops.length}</span>
              </div>

              {routeLoading ? (
                <div className={styles.emptyState}>Refreshing route…</div>
              ) : stops.length === 0 ? (
                <div className={styles.emptyState}>No assigned stops yet.</div>
              ) : (
                <div className={styles.stopList}>
                  {stops.map((stop) => (
                    <button
                      type="button"
                      key={stop.id}
                      className={`${styles.stopCard} ${selectedStopId === stop.id ? styles.stopCardActive : ""}`}
                      onClick={() => setSelectedStopId(stop.id)}
                    >
                      <div className={styles.stopCardTop}>
                        <div className={styles.stopSequence}>{stop.sequence}</div>
                        <div className={styles.stopCardBody}>
                          <div className={styles.stopCardHeader}>
                            <strong>{stop.customerName}</strong>
                            <span className={`${styles.chip} ${styles[`tone${toLabel(stop.status).replace(/\s+/g, "")}`] || styles.tonepending}`}>
                              {toLabel(stop.status)}
                            </span>
                          </div>
                          <p>{stop.orderNumber}</p>
                          <p className={styles.stopSubline}>{formatAddress(stop)}</p>
                          <div className={styles.stopMetaRow}>
                            <span>{stop.items} items</span>
                            <span>{stop.weight.toFixed(0)} kg</span>
                            <span>{stop.etaLabel || stop.scheduledTime || `Stop ${stop.sequence}`}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.detailPanel}>
              <div className={styles.sectionHead}>
                <div>
                  <p className={styles.sectionEyebrow}>Stop Detail</p>
                  <h3 className={styles.sectionTitleSmall}>{stopDetail?.customerName || selectedStop?.customerName || "No stop selected"}</h3>
                </div>
              </div>

              {stopDetail ? (
                <div className={styles.detailGrid}>
                  <div className={styles.detailCard}>
                    <span>Route</span>
                    <strong>{stopDetail.routeName || route?.name || "Unassigned route"}</strong>
                    <p>{stopDetail.routeNumber || route?.routeNumber || "No route number"}</p>
                  </div>
                  <div className={styles.detailCard}>
                    <span>Contact</span>
                    <strong>{stopDetail.contactName || stopDetail.customerName}</strong>
                    <p>{stopDetail.contactPhone || stopDetail.contactEmail || "No contact details"}</p>
                  </div>
                  <div className={`${styles.detailCard} ${styles.detailCardWide}`}>
                    <span>Delivery instructions</span>
                    <strong>{stopDetail.deliveryInstructions || "No special instructions"}</strong>
                    <p>{formatAddress(stopDetail)}</p>
                  </div>
                  <div className={styles.detailCard}>
                    <span>Proof history</span>
                    <strong>{stopDetail.receivedBy || "Pending"}</strong>
                    <p>
                      {stopDetail.deliveredAt
                        ? `Delivered ${formatTime(stopDetail.deliveredAt)}`
                        : stopDetail.arrivedAt
                          ? `Arrived ${formatTime(stopDetail.arrivedAt)}`
                          : stopDetail.enRouteAt
                            ? `En route ${formatTime(stopDetail.enRouteAt)}`
                            : "Awaiting action"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className={styles.emptyState}>Select a stop to load details and proof history.</div>
              )}
            </div>
          </div>
        </section>

        {route?.recentActivity?.length ? (
          <section className={styles.activityPanel}>
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.sectionEyebrow}>Recent Activity</p>
                <h3 className={styles.sectionTitleSmall}>Live route updates</h3>
              </div>
            </div>
            <div className={styles.activityList}>
              {route.recentActivity.map((item) => (
                <div key={`${item.at}-${item.label}`} className={styles.activityItem}>
                  <strong>{item.label}</strong>
                  <span>{formatTime(item.at)}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.proofDock}>
          <div className={styles.proofTop}>
            <div>
              <p className={styles.sectionEyebrow}>Proof Of Delivery</p>
              <h3 className={styles.sectionTitleSmall}>{selectedStop?.customerName || "No stop selected"}</h3>
            </div>

            {selectedStop ? (
              <div className={styles.dockActions}>
                {selectedStop.status !== "en_route" && selectedStop.status !== "arrived" && selectedStop.status !== "delivered" ? (
                  <button className={styles.secondaryButton} disabled={saving} onClick={() => void markEnRoute()}>
                    <Truck size={18} />
                    En route
                  </button>
                ) : null}
                {selectedStop.status === "en_route" ? (
                  <button className={styles.secondaryButton} disabled={saving} onClick={() => void markArrived()}>
                    <MapPinned size={18} />
                    Arrived
                  </button>
                ) : null}
                <button className={styles.secondaryButton} disabled={saving} onClick={() => setExceptionOpen((current) => !current)}>
                  <AlertTriangle size={18} />
                  Report issue
                </button>
                <button className={styles.primaryButton} disabled={saving || !selectedStop} onClick={() => void completeStop()}>
                  {saving ? <Loader2 size={18} className={styles.spin} /> : <CheckCircle2 size={18} />}
                  Complete stop
                </button>
              </div>
            ) : null}
          </div>

          {selectedStop ? (
            <>
              <div className={styles.proofGrid}>
                <label className={styles.field}>
                  <span><User size={14} /> Received by</span>
                  <input
                    className={styles.input}
                    value={proof.receivedBy}
                    onChange={(event) => setProof((current) => ({ ...current, receivedBy: event.target.value }))}
                    placeholder="Recipient name"
                  />
                </label>

                <label className={styles.field}>
                  <span><Phone size={14} /> Contact</span>
                  <div className={styles.readonlyField}>{selectedStop.contactPhone || selectedStop.contactName || selectedStop.customerName}</div>
                </label>

                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Delivery notes</span>
                  <textarea
                    className={styles.textarea}
                    value={proof.notes}
                    onChange={(event) => setProof((current) => ({ ...current, notes: event.target.value }))}
                    placeholder="Gate code, floor, handoff notes, or delivery summary"
                  />
                </label>

                <label className={styles.field}>
                  <span><Camera size={14} /> Delivery photo</span>
                      <input
                        className={styles.fileInput}
                        type="file"
                        accept="image/*"
                        onChange={(event) => void handlePhotoSelected(event.target.files)}
                      />
                  <div className={styles.uploadCard}>
                    <strong>{proof.photoUrl ? "Photo uploaded" : "Attach proof photo"}</strong>
                    <p>{proof.photoUrl ? "Ready to submit with stop completion." : "Use camera or gallery."}</p>
                  </div>
                </label>

                <label className={styles.field}>
                  <span><Wallet size={14} /> Cash on delivery</span>
                  <div className={styles.cashCard}>
                    <div>
                      <strong>{formatMoney(selectedStop.codAmount)}</strong>
                      <p>{selectedStop.codAmount > 0 ? "Collect payment before completing the stop." : "No COD required."}</p>
                    </div>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={proof.codCollected}
                        onChange={(event) => setProof((current) => ({ ...current, codCollected: event.target.checked }))}
                        disabled={selectedStop.codAmount <= 0}
                      />
                      <span>Collected</span>
                    </label>
                  </div>
                </label>

                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <span><Signature size={14} /> Signature capture</span>
                  <canvas
                    ref={signatureCanvasRef}
                    className={styles.signaturePad}
                    onPointerDown={startDrawing}
                    onPointerMove={drawSignature}
                    onPointerUp={stopDrawing}
                    onPointerLeave={stopDrawing}
                  />
                  <div className={styles.signatureActions}>
                    <button className={styles.secondaryButton} type="button" onClick={clearSignature}>
                      Clear signature
                    </button>
                    <span>{proof.signatureUrl ? "Signature uploaded and ready." : "Draw a signature before completion if needed."}</span>
                  </div>
                </div>
              </div>

              {exceptionOpen ? (
                <div className={styles.exceptionPanel}>
                  <div className={styles.sectionHead}>
                    <div>
                      <p className={styles.sectionEyebrow}>Delivery Exception</p>
                      <h3 className={styles.sectionTitleSmall}>Report an issue</h3>
                    </div>
                    <button className={styles.iconButton} onClick={() => setExceptionOpen(false)} type="button">
                      <XCircle size={18} />
                    </button>
                  </div>

                  <div className={styles.exceptionGrid}>
                    <label className={styles.field}>
                      <span>Reason</span>
                      <select
                        className={styles.input}
                        value={exceptionDraft.exceptionReason}
                        onChange={(event) => setExceptionDraft((current) => ({ ...current, exceptionReason: event.target.value }))}
                      >
                        {EXCEPTION_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Exception notes</span>
                      <textarea
                        className={styles.textarea}
                        value={exceptionDraft.notes}
                        onChange={(event) => setExceptionDraft((current) => ({ ...current, notes: event.target.value }))}
                        placeholder="Describe what happened at this stop"
                      />
                    </label>

                    <label className={styles.field}>
                      <span><Camera size={14} /> Exception photo</span>
                      <input
                        className={styles.fileInput}
                        type="file"
                        accept="image/*"
                        onChange={(event) => void handleExceptionPhotoSelected(event.target.files)}
                      />
                      <div className={styles.uploadCard}>
                        <strong>{exceptionDraft.exceptionPhotoUrl ? "Photo uploaded" : "Attach issue photo"}</strong>
                        <p>{exceptionDraft.exceptionPhotoUrl ? "Issue evidence ready." : "Optional for failed attempts."}</p>
                      </div>
                    </label>

                    <label className={styles.toggleBlock}>
                      <input
                        type="checkbox"
                        checked={exceptionDraft.rescheduleRequested}
                        onChange={(event) => setExceptionDraft((current) => ({ ...current, rescheduleRequested: event.target.checked }))}
                      />
                      <span>Request reschedule</span>
                    </label>
                  </div>

                  <div className={styles.exceptionActions}>
                    <button className={styles.secondaryButton} type="button" onClick={() => setExceptionOpen(false)}>
                      Cancel
                    </button>
                    <button className={styles.dangerButton} type="button" disabled={saving} onClick={() => void submitException()}>
                      <AlertTriangle size={18} />
                      Submit issue
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className={styles.emptyState}>Select a stop to capture proof or report an exception.</div>
          )}
        </section>
      </div>
    </main>
  )
}
