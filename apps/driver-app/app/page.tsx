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
    email: "driver@rdmpizza.com.au",
    password: "password123",
  })

  // Data Stores
  const [driverRoute, setDriverRoute] = useState<DriverRoute | null>(null)
  const [pickLists, setPickLists] = useState<PickList[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [dispatchOrders, setDispatchOrders] = useState<DispatchOrder[]>([])

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
          const defaultMode = profile.role === "warehouse" ? "warehouse" : "driver"
          setActiveMode(defaultMode)
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
      // Parallel loading of relevant stores
      const promises: Promise<unknown>[] = []

      // Driver route
      promises.push(
        api<{ success: true; data: { driver: UserProfile; route: DriverRoute | null } }>("driver/route")
          .then((res) => setDriverRoute(res.data.route))
          .catch(() => setDriverRoute(null))
      )

      // Pick Lists
      promises.push(
        api<{ success: true; data: PickList[] }>("pick-lists")
          .then((res) => setPickLists(res.data || []))
          .catch(() => setPickLists([]))
      )

      // Purchase Orders (for Receiving)
      promises.push(
        api<{ success: true; data: PurchaseOrder[] }>("purchase-orders")
          .then((res) => setPurchaseOrders(res.data || []))
          .catch(() => setPurchaseOrders([]))
      )

      // Inventory
      promises.push(
        api<{ success: true; data: InventoryItem[] }>("inventory")
          .then((res) => setInventory(res.data || []))
          .catch(() => setInventory([]))
      )

      // Orders (for Dispatch)
      promises.push(
        api<{ success: true; data: any[] }>("orders?status=packed")
          .then((res) => {
            const list = (res.data || []).map((o) => ({
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
          })
          .catch(() => setDispatchOrders([]))
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
        setDriverRoute(res.data.route)
      } else {
        if (warehouseTab === "picking") {
          const res = await api<{ success: true; data: PickList[] }>("pick-lists")
          setPickLists(res.data || [])
        } else if (warehouseTab === "receiving") {
          const res = await api<{ success: true; data: PurchaseOrder[] }>("purchase-orders")
          setPurchaseOrders(res.data || [])
        } else if (warehouseTab === "inventory") {
          const res = await api<{ success: true; data: InventoryItem[] }>("inventory")
          setInventory(res.data || [])
        } else if (warehouseTab === "dispatch") {
          const res = await api<{ success: true; data: any[] }>("orders?status=packed")
          const list = (res.data || []).map((o) => ({
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

  // --- Driver Action Handlers ---
  async function handleUpdateStop(stopId: string, payload: Record<string, unknown>) {
    await api(`driver/stops/${stopId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    await refreshCurrentModeData(false)
  }

  async function handleSubmitException(stopId: string, payload: Record<string, unknown>) {
    await api(`driver/stops/${stopId}/exception`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    await refreshCurrentModeData(false)
  }

  // --- Warehouse Action Handlers ---
  async function handleUpdatePickItem(pickListId: string, itemId: string, incrementBy: number) {
    await api(`pick-lists/${pickListId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, incrementBy }),
    })
    await refreshCurrentModeData(false)
  }

  async function handleReceivePO(
    poId: string,
    receivedItems: Array<{ itemId: string; receivedQty: number; batchCode?: string; expiryDate?: string }>
  ) {
    await api(`purchase-orders/${poId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "receive",
        receivedItems,
      }),
    })
    await refreshCurrentModeData(false)
  }

  async function handleAdjustStock(
    productId: string,
    warehouseId: string,
    type: "adjustment" | "in" | "out",
    quantity: number,
    notes: string
  ) {
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
    await refreshCurrentModeData(false)
  }

  async function handleDispatchOrder(orderId: string, payload: Record<string, unknown>) {
    await api(`orders/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    await refreshCurrentModeData(false)
  }

  // Loading Splash
  if (loading) {
    return (
      <main className={styles.page}>
        <div style={{ margin: "auto", textAlign: "center" }}>
          <Loader2 className={styles.spin} size={36} style={{ color: "#38bdf8", margin: "0 auto 12px auto" }} />
          <p style={{ color: "#94a3b8", fontSize: "14px", fontWeight: 600 }}>Loading SupplySure Operations…</p>
        </div>
      </main>
    )
  }

  // Sign In Screen
  if (!user) {
    return (
      <main className={styles.page}>
        <div className={styles.authShell}>
          <div className={styles.authHero}>
            <div className={styles.authIcon}>
              <Boxes size={28} />
            </div>
            <h1 className={styles.authTitle}>SupplySure Operations</h1>
            <p className={styles.authCopy}>
              Unified Companion App for Delivery Drivers and Warehouse Staff. Sign in to access your run sheet,
              guided picking, stock lookup, and receiving.
            </p>
          </div>

          {/* Demo Role Presets for 1-Click Login */}
          <div className={styles.demoPresetsCard}>
            <h4 className={styles.demoPresetsTitle}>Quick Demo Logins</h4>
            <div className={styles.demoButtonsGrid}>
              <button
                type="button"
                className={styles.demoBtn}
                onClick={() =>
                  setAuthForm({ email: "driver@rdmpizza.com.au", password: "password123" })
                }
              >
                <Truck size={16} style={{ color: "#38bdf8" }} />
                <span>Driver</span>
              </button>

              <button
                type="button"
                className={styles.demoBtn}
                onClick={() =>
                  setAuthForm({ email: "warehouse@rdmpizza.com.au", password: "password123" })
                }
              >
                <Boxes size={16} style={{ color: "#34d399" }} />
                <span>Warehouse</span>
              </button>

              <button
                type="button"
                className={styles.demoBtn}
                onClick={() =>
                  setAuthForm({ email: "admin@rdmpizza.com.au", password: "password123" })
                }
              >
                <ShieldCheck size={16} style={{ color: "#facc15" }} />
                <span>Admin</span>
              </button>
            </div>
          </div>

          {/* Sign In Form */}
          <div className={styles.authFormCard}>
            {authError && <div className={styles.errorBanner} style={{ marginBottom: "14px" }}>{authError}</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void signIn()
              }}
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
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
                className={styles.primaryBtn}
                style={{ width: "100%", padding: "14px", marginTop: "6px" }}
              >
                {authLoading ? (
                  <>
                    <Loader2 size={18} className={styles.spin} />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <span>Sign In to Operations</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  // Active Driver or Warehouse UI
  const pendingPicksCount = pickLists.filter((p) => p.status === "pending" || p.status === "in_progress").length
  const pendingPOCount = purchaseOrders.filter((po) => po.status !== "received").length
  const pendingDispatchCount = dispatchOrders.length

  return (
    <main className={styles.page}>
      {/* Sticky Mode Header */}
      <ModeHeader
        user={user}
        company={company}
        activeMode={activeMode}
        onModeChange={(mode) => setActiveMode(mode)}
        onSignOut={signOut}
        isOnline={isOnline}
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
            <div className={styles.routeContainer}>
              <div className={styles.summaryCard}>
                <h2 className={styles.summaryTitle}>Completed Deliveries</h2>
                <p className={styles.summarySub}>Today's delivered and closed out consignments</p>
              </div>

              <div className={styles.stopsList}>
                {driverRoute?.stops
                  .filter((s) => s.status === "delivered")
                  .map((stop) => (
                    <div key={stop.id} className={`${styles.stopCard} ${styles.stopDelivered}`}>
                      <div className={styles.stopCardTop}>
                        <span className={styles.badgePrimary}>#{stop.sequence}</span>
                        <span className={styles.statusPillSuccess}>Delivered ✓</span>
                      </div>
                      <h3 className={styles.stopCustomerName} style={{ marginTop: "4px" }}>
                        {stop.customerName}
                      </h3>
                      <p className={styles.stopOrderMeta}>
                        Received by: {stop.receivedBy || "Customer"} • {stop.deliveryNumber}
                      </p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {driverTab === "profile" && (
            <div className={styles.routeContainer}>
              <div className={styles.summaryCard}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div className={styles.brandLogoIcon}>
                    <User size={22} />
                  </div>
                  <div>
                    <h2 className={styles.summaryTitle}>{user.name}</h2>
                    <p className={styles.summarySub}>{user.email}</p>
                  </div>
                </div>

                <div className={styles.detailGrid} style={{ marginTop: "14px" }}>
                  <div className={styles.detailGridItem}>
                    <span className={styles.blockLabel}>Role</span>
                    <span className={styles.detailGridValue}>{user.role.toUpperCase()}</span>
                  </div>
                  <div className={styles.detailGridItem}>
                    <span className={styles.blockLabel}>Contact Phone</span>
                    <span className={styles.detailGridValue}>{user.phone || "Not set"}</span>
                  </div>
                  <div className={styles.detailGridItem}>
                    <span className={styles.blockLabel}>Vehicle</span>
                    <span className={styles.detailGridValue}>{driverRoute?.vehicle || "Fleet Van"}</span>
                  </div>
                  <div className={styles.detailGridItem}>
                    <span className={styles.blockLabel}>Warehouse Base</span>
                    <span className={styles.detailGridValue}>
                      {driverRoute?.warehouseName || "Main Hub"}
                    </span>
                  </div>
                </div>
              </div>
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
        </>
      )}

      {/* Bottom Sub-Navigation Bar */}
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
