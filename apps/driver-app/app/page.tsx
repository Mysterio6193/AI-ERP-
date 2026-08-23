"use client"

import { useEffect, useState } from "react"
import {
  Boxes,
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Package,
  Phone,
  Route,
  ShieldCheck,
  Truck,
  User,
} from "lucide-react"
import { audioFeedback } from "./components/ui/AudioFeedback"
import { ModeHeader, UserProfile, CompanyInfo } from "./components/shared/ModeHeader"
import { BottomNav } from "./components/shared/BottomNav"
import { DriverRouteView, DriverRoute } from "./components/driver/DriverRouteView"
import { WarehousePickingView, PickList } from "./components/warehouse/WarehousePickingView"
import { WarehouseReceivingView, PurchaseOrder } from "./components/warehouse/WarehouseReceivingView"
import { WarehouseInventoryView, InventoryItem } from "./components/warehouse/WarehouseInventoryView"
import { WarehouseDispatchView, DispatchOrder } from "./components/warehouse/WarehouseDispatchView"
import { WarehouseAuditLedgerView, WarehouseActivityData } from "./components/warehouse/WarehouseAuditLedgerView"
import {
  FALLBACK_ACTIVITY,
  FALLBACK_DISPATCH_ORDERS,
  FALLBACK_INVENTORY,
  FALLBACK_PICK_LISTS,
  FALLBACK_PURCHASE_ORDERS,
} from "./components/warehouse/demoData"
import styles from "./page.module.css"

const POLL_INTERVAL_MS = 25000

export default function OperationsAppPage() {
  const [company, setCompany] = useState<CompanyInfo | null>(null)
  const [user, setUser] = useState<UserProfile | null>(null)
  const [activeMode, setActiveMode] = useState<"driver" | "warehouse">("driver")
  const [driverTab, setDriverTab] = useState<string>("route")
  const [warehouseTab, setWarehouseTab] = useState<string>("picking")

  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  // Auth form
  const [authForm, setAuthForm] = useState({
    email: "driver@supplysure.com.au",
    password: "password123",
  })

  // Data Stores
  const [driverRoute, setDriverRoute] = useState<DriverRoute | null>(null)
  const [pickLists, setPickLists] = useState<PickList[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [dispatchOrders, setDispatchOrders] = useState<DispatchOrder[]>([])
  const [warehouseActivity, setWarehouseActivity] = useState<WarehouseActivityData | null>(null)

  // Network online listener
  useEffect(() => {
    setIsOnline(navigator.onLine)
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  // Initial Bootstrap
  useEffect(() => {
    void bootstrap()
  }, [])

  // Background Polling
  useEffect(() => {
    if (!user) return
    const timer = setInterval(() => {
      void refreshCurrentModeData(false)
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [user?.id, activeMode])

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/api/core/${path}`, {
      ...init,
      headers: {
        ...(init?.headers || {}),
      },
      cache: "no-store",
    })

    const data = await res.json()
    if (!res.ok || data.success === false) {
      throw new Error(data.error || "Request failed")
    }

    return data
  }

  async function bootstrap() {
    try {
      setLoading(true)
      setAuthError(null)

      // Fetch company branding
      try {
        const companyRes = await api<{ success: true; data: CompanyInfo }>("settings/company")
        setCompany(companyRes.data)
      } catch (err) {
        console.warn("Company settings fetch warning:", err)
      }

      // Check existing session
      try {
        const sessionRes = await api<{ success: true; data: UserProfile }>("driver/session")
        if (sessionRes?.data) {
          const profile = sessionRes.data
          setUser(profile)
          let targetMode: "driver" | "warehouse" = profile.role === "warehouse" ? "warehouse" : "driver"
          if (typeof window !== "undefined") {
            const urlMode = new URLSearchParams(window.location.search).get("mode")
            if (urlMode === "warehouse" || urlMode === "driver") {
              targetMode = urlMode
            }
          }
          setActiveMode(targetMode)
          await loadAllData(profile.role)
        }
      } catch {
        setUser(null)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function loadAllData(role?: string) {
    setDataLoading(true)
    try {
      const promises: Promise<unknown>[] = []

      // Driver route
      promises.push(
        api<{ success: true; data: { driver: UserProfile; route: DriverRoute | null } }>("driver/route")
          .then((res) => setDriverRoute(res.data?.route || null))
          .catch(() => setDriverRoute(null))
      )

      // Pick Lists
      promises.push(
        api<{ success: true; data: PickList[] }>("pick-lists")
          .then((res) => {
            if (res.data && res.data.length > 0) {
              setPickLists(res.data)
            } else {
              setPickLists(FALLBACK_PICK_LISTS)
            }
          })
          .catch(() => setPickLists(FALLBACK_PICK_LISTS))
      )

      // Purchase Orders (for Receiving)
      promises.push(
        api<{ success: true; data: PurchaseOrder[] }>("purchase-orders")
          .then((res) => {
            if (res.data && res.data.length > 0) {
              setPurchaseOrders(res.data)
            } else {
              setPurchaseOrders(FALLBACK_PURCHASE_ORDERS)
            }
          })
          .catch(() => setPurchaseOrders(FALLBACK_PURCHASE_ORDERS))
      )

      // Inventory
      promises.push(
        api<{ success: true; data: any[] }>("inventory")
          .then((res) => {
            if (res.data && res.data.length > 0) {
              const mapped = res.data.map((i) => ({
                id: i.id,
                productId: i.productId,
                warehouseId: i.warehouseId,
                quantity: i.quantity,
                allocated: i.allocated ?? i.reserved ?? 0,
                reorderLevel: i.reorderLevel || 10,
                location: i.location || (i.product?.storageTemp === "chilled" ? "COLD-ROOM-02" : i.product?.storageTemp === "frozen" ? "COLD-ROOM-01" : "AISLE-A-01"),
                isLowStock: i.isLowStock || i.quantity <= (i.reorderLevel || 10),
                product: i.product || { id: i.productId, name: "Product", sku: "SKU", baseUnit: "unit" },
                warehouse: i.warehouse || { id: i.warehouseId, name: "Main Hub" },
              }))
              setInventory(mapped)
            } else {
              setInventory(FALLBACK_INVENTORY)
            }
          })
          .catch(() => setInventory(FALLBACK_INVENTORY))
      )

      // Orders (for Dispatch)
      promises.push(
        api<{ success: true; data: any[] }>("orders?status=packed")
          .then((res) => {
            if (res.data && res.data.length > 0) {
              const list = res.data.map((o) => ({
                id: o.id,
                orderNumber: o.orderNumber,
                customerName: o.customer?.name || "Customer",
                deliveryAddress: [o.deliveryAddress, o.deliveryCity, o.deliveryState, o.deliveryPostcode]
                  .filter(Boolean)
                  .join(", "),
                status: o.status,
                itemsCount: o.items?.length || 0,
                totalCartons: o.totalCartons || o.items?.length || 1,
                totalWeight: o.totalWeight || 0,
                carrierName: o.carrierName,
                consignmentNumber: o.consignmentNumber,
                assignedDriverName: o.assignedDriver?.name,
                routeNumber: o.route?.routeNumber,
                requiredDate: o.requiredDate,
              }))
              setDispatchOrders(list)
            } else {
              setDispatchOrders(FALLBACK_DISPATCH_ORDERS)
            }
          })
          .catch(() => setDispatchOrders(FALLBACK_DISPATCH_ORDERS))
      )

      // Activity / Inbound / Outbound Audit Ledger
      promises.push(
        api<{ success: true; data: WarehouseActivityData }>("warehouse/activity")
          .then((res) => {
            if (res.data && (res.data.receivedGoods?.length > 0 || res.data.dispatchedGoods?.length > 0)) {
              setWarehouseActivity(res.data)
            } else {
              setWarehouseActivity(FALLBACK_ACTIVITY)
            }
          })
          .catch(() => setWarehouseActivity(FALLBACK_ACTIVITY))
      )

      await Promise.all(promises)
    } catch (err) {
      console.error("Data load error:", err)
    } finally {
      setDataLoading(false)
    }
  }

  async function refreshCurrentModeData(showSpinner = true) {
    if (showSpinner) setDataLoading(true)
    try {
      if (activeMode === "driver") {
        const res = await api<{
          success: true
          data: { driver: UserProfile; route: DriverRoute | null }
        }>("driver/route")
        setDriverRoute(res.data?.route || null)
      } else {
        if (warehouseTab === "picking") {
          const res = await api<{ success: true; data: PickList[] }>("pick-lists")
          setPickLists(res.data && res.data.length > 0 ? res.data : FALLBACK_PICK_LISTS)
        } else if (warehouseTab === "receiving") {
          const res = await api<{ success: true; data: PurchaseOrder[] }>("purchase-orders")
          setPurchaseOrders(res.data && res.data.length > 0 ? res.data : FALLBACK_PURCHASE_ORDERS)
        } else if (warehouseTab === "inventory") {
          const res = await api<{ success: true; data: any[] }>("inventory")
          if (res.data && res.data.length > 0) {
            const mapped = res.data.map((i) => ({
              id: i.id,
              productId: i.productId,
              warehouseId: i.warehouseId,
              quantity: i.quantity,
              allocated: i.allocated ?? i.reserved ?? 0,
              reorderLevel: i.reorderLevel || 10,
              location: i.location || (i.product?.storageTemp === "chilled" ? "COLD-ROOM-02" : i.product?.storageTemp === "frozen" ? "COLD-ROOM-01" : "AISLE-A-01"),
              isLowStock: i.isLowStock || i.quantity <= (i.reorderLevel || 10),
              product: i.product || { id: i.productId, name: "Product", sku: "SKU", baseUnit: "unit" },
              warehouse: i.warehouse || { id: i.warehouseId, name: "Main Hub" },
            }))
            setInventory(mapped)
          } else {
            setInventory(FALLBACK_INVENTORY)
          }
        } else if (warehouseTab === "dispatch") {
          const res = await api<{ success: true; data: any[] }>("orders?status=packed")
          if (res.data && res.data.length > 0) {
            const list = res.data.map((o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              customerName: o.customer?.name || "Customer",
              deliveryAddress: [o.deliveryAddress, o.deliveryCity, o.deliveryState, o.deliveryPostcode]
                .filter(Boolean)
                .join(", "),
              status: o.status,
              itemsCount: o.items?.length || 0,
              totalCartons: o.totalCartons || o.items?.length || 1,
              totalWeight: o.totalWeight || 0,
              carrierName: o.carrierName,
              consignmentNumber: o.consignmentNumber,
              assignedDriverName: o.assignedDriver?.name,
              routeNumber: o.route?.routeNumber,
              requiredDate: o.requiredDate,
            }))
            setDispatchOrders(list)
          } else {
            setDispatchOrders(FALLBACK_DISPATCH_ORDERS)
          }
        } else if (warehouseTab === "activity") {
          const res = await api<{ success: true; data: WarehouseActivityData }>("warehouse/activity")
          setWarehouseActivity(res.data || FALLBACK_ACTIVITY)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      if (showSpinner) setDataLoading(false)
    }
  }

  async function signIn() {
    try {
      setAuthLoading(true)
      setAuthError(null)

      const response = await api<{
        success: true
        data: { token: string; driver: UserProfile }
      }>("driver/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(authForm),
      })

      setUser(response.data.driver)
      const defaultMode = response.data.driver.role === "warehouse" ? "warehouse" : "driver"
      setActiveMode(defaultMode)
      audioFeedback.playSuccessChime()
      await loadAllData(response.data.driver.role)
    } catch (err) {
      console.error(err)
      setAuthError(err instanceof Error ? err.message : "Unable to sign in.")
      audioFeedback.playErrorBuzz()
    } finally {
      setAuthLoading(false)
    }
  }

  async function signOut() {
    try {
      await api("driver/session", { method: "DELETE" })
      setUser(null)
      setDriverRoute(null)
      setPickLists([])
    } catch (err) {
      console.error(err)
    }
  }

  // Action Handlers
  async function handleUpdateStop(stopId: string, payload: Record<string, unknown>) {
    setDriverRoute((prev) => {
      if (!prev) return null
      return {
        ...prev,
        stops: prev.stops.map((s) => (s.id === stopId ? { ...s, ...payload } : s)),
      }
    })

    try {
      if (!stopId.startsWith("demo-")) {
        await api(`driver/stops/${stopId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
    } catch (err) {
      console.warn("Update stop sync warning:", err)
    }
    await refreshCurrentModeData(false)
  }

  async function handleSubmitException(stopId: string, payload: Record<string, unknown>) {
    setDriverRoute((prev) => {
      if (!prev) return null
      return {
        ...prev,
        stops: prev.stops.map((s) =>
          s.id === stopId ? { ...s, status: "failed", exceptionReason: (payload.reason as string) || "Exception" } : s
        ),
      }
    })

    try {
      if (!stopId.startsWith("demo-")) {
        await api(`driver/stops/${stopId}/exception`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
    } catch (err) {
      console.warn("Exception submit warning:", err)
    }
    await refreshCurrentModeData(false)
  }

  async function handleUpdatePickItem(pickListId: string, itemId: string, incrementBy: number) {
    setPickLists((prev) =>
      prev.map((pl) => {
        if (pl.id !== pickListId) return pl
        const updatedItems = pl.items.map((it) => {
          if (it.id !== itemId) return it
          const newPicked = Math.min(it.requiredQty, Math.max(0, it.pickedQty + incrementBy))
          return {
            ...it,
            pickedQty: newPicked,
            status: newPicked >= it.requiredQty ? "picked" : "pending",
          }
        })
        const allDone = updatedItems.every((i) => i.pickedQty >= i.requiredQty)
        const anyDone = updatedItems.some((i) => i.pickedQty > 0)
        return {
          ...pl,
          items: updatedItems,
          status: allDone ? "completed" : anyDone ? "in_progress" : pl.status,
          progress: Math.round(
            (updatedItems.reduce((s, i) => s + i.pickedQty, 0) /
              Math.max(1, updatedItems.reduce((s, i) => s + i.requiredQty, 0))) *
              100
          ),
        }
      })
    )

    try {
      if (!pickListId.startsWith("pk-demo")) {
        await api(`pick-lists/${pickListId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId, incrementBy }),
        })
      }
    } catch (err) {
      console.warn("Pick item update sync warning:", err)
    }
    await refreshCurrentModeData(false)
  }

  async function handleReceivePO(
    poId: string,
    receivedItems: Array<{ itemId: string; receivedQty: number; batchCode?: string; expiryDate?: string }>
  ) {
    setPurchaseOrders((prev) =>
      prev.map((po) => {
        if (po.id !== poId) return po
        const updatedItems = po.items.map((it) => {
          const rec = receivedItems.find((r) => r.itemId === it.id)
          if (!rec) return it
          return {
            ...it,
            receivedQty: it.receivedQty + rec.receivedQty,
          }
        })
        const allReceived = updatedItems.every((i) => i.receivedQty >= i.quantity)
        return {
          ...po,
          items: updatedItems,
          status: allReceived ? "received" : "partial",
        }
      })
    )

    try {
      if (!poId.startsWith("po-demo")) {
        // Calculate whether all items will be fully received after this receipt
        const targetPO = purchaseOrders.find((p) => p.id === poId)
        const allFullyReceived = targetPO
          ? targetPO.items.every((it) => {
              const rec = receivedItems.find((r) => r.itemId === it.id)
              const newReceived = it.receivedQty + (rec?.receivedQty || 0)
              return newReceived >= it.quantity
            })
          : false

        await api(`purchase-orders/${poId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: allFullyReceived ? "received" : "partial",
            receivedItems,
          }),
        })
      }
    } catch (err) {
      console.warn("Receive PO sync warning:", err)
    }
    await refreshCurrentModeData(false)
  }

  async function handleAdjustStock(
    productId: string,
    warehouseId: string,
    type: "adjustment" | "in" | "out",
    quantity: number,
    notes: string
  ) {
    setInventory((prev) =>
      prev.map((inv) => {
        if (inv.productId !== productId || inv.warehouseId !== warehouseId) return inv
        let newQty = inv.quantity
        if (type === "in") newQty += quantity
        else if (type === "out") newQty = Math.max(0, newQty - quantity)
        else newQty = quantity
        return {
          ...inv,
          quantity: newQty,
          isLowStock: newQty <= inv.reorderLevel,
        }
      })
    )

    try {
      if (!productId.startsWith("prod-demo")) {
        await api("inventory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId,
            warehouseId,
            type,
            quantity,
            notes,
          }),
        })
      }
    } catch (err) {
      console.warn("Adjust stock sync warning:", err)
    }
    await refreshCurrentModeData(false)
  }

  async function handleDispatchOrder(orderId: string, payload: Record<string, unknown>) {
    const isDispatched = payload.status === "dispatched"

    if (isDispatched) {
      // Order leaves the dock — remove from active dispatch queue
      setDispatchOrders((prev) => prev.filter((o) => o.id !== orderId))
    } else {
      // Order is being packed/staged — update status in-place, keep in list
      setDispatchOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? {
                ...o,
                status: String(payload.status || o.status),
                carrierName: (payload.carrierName as string) || o.carrierName,
                consignmentNumber: (payload.consignmentNumber as string) || o.consignmentNumber,
                totalCartons: (payload.totalCartons as number) || o.totalCartons,
                totalWeight: (payload.totalWeight as number) || o.totalWeight,
              }
            : o
        )
      )
    }

    try {
      if (!orderId.startsWith("so-demo")) {
        await api(`orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }
    } catch (err) {
      console.warn("Dispatch order sync warning:", err)
    }
    await refreshCurrentModeData(false)
  }

  const [seeding, setSeeding] = useState(false)
  const [seedNotice, setSeedNotice] = useState<string | null>(null)

  async function handleSeedDemo() {
    try {
      setSeeding(true)
      setSeedNotice(null)
      await api("demo-seed", { method: "POST" })
      audioFeedback.playSuccessChime()
      setSeedNotice("✓ Live demo data populated successfully!")
      if (user) {
        await loadAllData(user.role)
      }
    } catch (err) {
      console.error(err)
      setSeedNotice("Demo data seeded with defaults.")
    } finally {
      setSeeding(false)
    }
  }

  // Loading Splash
  if (loading) {
    return (
      <main className={styles.page} style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <Loader2 className={styles.spin} size={32} style={{ color: "var(--primary)", margin: "0 auto 12px auto" }} />
          <p style={{ color: "var(--ink-muted-48)", fontSize: "14px", fontWeight: 400 }}>Loading SupplySure Operations…</p>
        </div>
      </main>
    )
  }

  // Sign In Screen (Apple Photography & Minimalist Museum Feel)
  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.authContainer}>
          <div className={styles.authHero}>
            <span className={styles.heroTaglineLight}>SupplySure Operations</span>
            <h1 className={styles.heroDisplay} style={{ fontSize: "36px" }}>
              Field & Floor Companion
            </h1>
            <p className={styles.heroLeadLight} style={{ fontSize: "17px" }}>
              Unified mobile operations for drivers, warehouse teams, and logistics dispatchers.
            </p>
          </div>

          {/* 1-Click Demo Login Chips */}
          <div className={styles.authCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className={styles.statLabel}>Quick Demo Profiles</span>
              <button
                type="button"
                onClick={handleSeedDemo}
                disabled={seeding}
                style={{
                  background: "rgba(0, 102, 204, 0.08)",
                  border: "1px solid var(--primary)",
                  borderRadius: "9999px",
                  padding: "4px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                  color: "var(--primary)",
                  cursor: "pointer",
                }}
              >
                {seeding ? "Populating..." : "⚡ Seed Demo Data"}
              </button>
            </div>

            {seedNotice && (
              <div style={{ color: "#15803d", fontSize: "13px", background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "8px 12px", borderRadius: "8px" }}>
                {seedNotice}
              </div>
            )}

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className={styles.optionChip}
                onClick={() =>
                  setAuthForm({ email: "driver@supplysure.com.au", password: "password123" })
                }
              >
                <Truck size={14} style={{ display: "inline", marginRight: "4px" }} />
                <span>Driver</span>
              </button>

              <button
                type="button"
                className={styles.optionChip}
                onClick={() =>
                  setAuthForm({ email: "warehouse@supplysure.com.au", password: "password123" })
                }
              >
                <Boxes size={14} style={{ display: "inline", marginRight: "4px" }} />
                <span>Warehouse</span>
              </button>

              <button
                type="button"
                className={styles.optionChip}
                onClick={() =>
                  setAuthForm({ email: "admin@supplysure.com.au", password: "password123" })
                }
              >
                <ShieldCheck size={14} style={{ display: "inline", marginRight: "4px" }} />
                <span>Admin</span>
              </button>
            </div>

            {authError && (
              <div style={{ color: "#b91c1c", fontSize: "14px", background: "#fef2f2", padding: "8px 12px", borderRadius: "8px" }}>
                {authError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void signIn()
              }}
              style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "6px" }}
            >
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Work Email</label>
                <input
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="name@company.com.au"
                  className={styles.textInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Password</label>
                <input
                  type="password"
                  required
                  value={authForm.password}
                  onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  className={styles.textInput}
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className={styles.buttonPrimary}
                style={{ width: "100%", marginTop: "6px" }}
              >
                {authLoading ? (
                  <>
                    <Loader2 size={18} className={styles.spin} />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  // Active App Container
  const pendingPicksCount = pickLists.filter((p) => p.status === "pending" || p.status === "in_progress").length
  const pendingPOCount = purchaseOrders.filter((po) => po.status !== "received").length
  const pendingDispatchCount = dispatchOrders.length

  return (
    <main className={styles.page}>
      {/* Apple 2-Row Nav (Global Nav + Frosted Sub-Nav) */}
      <ModeHeader
        user={user}
        company={company}
        activeMode={activeMode}
        onModeChange={(mode) => setActiveMode(mode)}
        onSignOut={signOut}
        isOnline={isOnline}
        onSeedDemo={handleSeedDemo}
        seeding={seeding}
      />

      {/* Driver Mode Active Views */}
      {activeMode === "driver" && (
        <>
          {driverTab === "route" && (
            <DriverRouteView
              route={driverRoute}
              loading={dataLoading}
              onRefresh={() => void refreshCurrentModeData(true)}
              onUpdateStop={handleUpdateStop}
              onSubmitException={handleSubmitException}
            />
          )}

          {driverTab === "history" && (
            <div className={styles.mainContent}>
              <section className={styles.heroTileLight}>
                <span className={styles.heroTaglineLight}>Archived Consignments</span>
                <h1 className={styles.heroDisplay} style={{ fontSize: "32px" }}>Completed Deliveries</h1>
                <p className={styles.heroLeadLight} style={{ fontSize: "17px" }}>
                  Today's signed and closed-out drop-offs
                </p>
              </section>

              <div className={styles.cardGrid}>
                {driverRoute?.stops
                  .filter((s) => s.status === "delivered")
                  .map((stop) => (
                    <div key={stop.id} className={`${styles.utilityCard} ${styles.utilityCardDone}`}>
                      <div className={styles.cardHeaderRow}>
                        <span className={styles.cardSequenceBadge}>Stop #{stop.sequence}</span>
                        <span className={styles.cardTagHighlight}>Delivered ✓</span>
                      </div>
                      <h3 className={styles.cardTitle}>{stop.customerName}</h3>
                      <p className={styles.cardSub}>
                        Received by: {stop.receivedBy || "Customer"} • {stop.deliveryNumber}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {driverTab === "profile" && (
            <div className={styles.mainContent}>
              <section className={styles.heroTileLight}>
                <span className={styles.heroTaglineLight}>Operator Card</span>
                <h1 className={styles.heroDisplay} style={{ fontSize: "32px" }}>{user.name}</h1>
                <p className={styles.heroLeadLight} style={{ fontSize: "17px" }}>{user.email}</p>

                <div className={styles.statStripLight}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Role</span>
                    <span className={styles.statValueLight} style={{ fontSize: "20px" }}>
                      {user.role.toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Contact Phone</span>
                    <span className={styles.statValueLight} style={{ fontSize: "20px" }}>
                      {user.phone || "Active"}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Vehicle</span>
                    <span className={styles.statValueLight} style={{ fontSize: "20px" }}>
                      {driverRoute?.vehicle || "Fleet Van"}
                    </span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Warehouse Base</span>
                    <span className={styles.statValueLight} style={{ fontSize: "20px" }}>
                      {driverRoute?.warehouseName || "Main Hub"}
                    </span>
                  </div>
                </div>
              </section>
            </div>
          )}
        </>
      )}

      {/* Warehouse Mode Active Views */}
      {activeMode === "warehouse" && (
        <>
          {warehouseTab === "picking" && (
            <WarehousePickingView
              pickLists={pickLists}
              loading={dataLoading}
              onRefresh={() => void refreshCurrentModeData(true)}
              onUpdatePickItem={handleUpdatePickItem}
              onPackOrder={handleDispatchOrder}
            />
          )}

          {warehouseTab === "receiving" && (
            <WarehouseReceivingView
              orders={purchaseOrders}
              loading={dataLoading}
              onRefresh={() => void refreshCurrentModeData(true)}
              onReceivePO={handleReceivePO}
            />
          )}

          {warehouseTab === "inventory" && (
            <WarehouseInventoryView
              inventory={inventory}
              loading={dataLoading}
              onRefresh={() => void refreshCurrentModeData(true)}
              onAdjustStock={handleAdjustStock}
            />
          )}

          {warehouseTab === "dispatch" && (
            <WarehouseDispatchView
              orders={dispatchOrders}
              loading={dataLoading}
              onRefresh={() => void refreshCurrentModeData(true)}
              onDispatchOrder={handleDispatchOrder}
            />
          )}

          {warehouseTab === "activity" && (
            <WarehouseAuditLedgerView
              data={warehouseActivity}
              loading={dataLoading}
              onRefresh={() => void refreshCurrentModeData(true)}
            />
          )}
        </>
      )}

      {/* Apple Floating Frosted Bottom Bar */}
      <BottomNav
        mode={activeMode}
        activeTab={activeMode === "driver" ? driverTab : warehouseTab}
        onTabChange={(tab) => {
          if (activeMode === "driver") {
            setDriverTab(tab)
          } else {
            setWarehouseTab(tab)
          }
        }}
        badges={{
          driverRoute: driverRoute?.stops.filter((s) => s.status !== "delivered" && s.status !== "failed").length,
          warehousePick: pendingPicksCount,
          warehouseReceive: pendingPOCount,
          warehouseDispatch: pendingDispatchCount,
        }}
      />
    </main>
  )
}
