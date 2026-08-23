"use client"

import { useEffect, useState } from "react"
import {
  Boxes,
  Database,
  LogOut,
  RefreshCw,
  Sparkles,
  Truck,
  Wifi,
  WifiOff,
} from "lucide-react"
import { offlineSync, QueuedAction } from "../ui/OfflineSync"
import styles from "../../page.module.css"

export interface UserProfile {
  id: string
  name: string
  email: string
  role: string
  status: string
  phone?: string | null
  avatar?: string | null
  licenseNumber?: string | null
  vehicleId?: string | null
  companyId?: string | null
}

export interface CompanyInfo {
  name?: string | null
  tradingName?: string | null
}

interface ModeHeaderProps {
  user: UserProfile
  company: CompanyInfo | null
  activeMode: "driver" | "warehouse"
  onModeChange: (mode: "driver" | "warehouse") => void
  onSignOut: () => void
  isOnline: boolean
  onSeedDemo?: () => void
  seeding?: boolean
}

export function ModeHeader({
  user,
  company,
  activeMode,
  onModeChange,
  onSignOut,
  isOnline,
  onSeedDemo,
  seeding,
}: ModeHeaderProps) {
  const brandTitle = company?.tradingName || company?.name || "SupplySure"
  const canSwitchModes = user.role === "admin" || user.role === "warehouse" || user.role === "driver"
  const [queue, setQueue] = useState<QueuedAction[]>([])
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    return offlineSync.subscribe((q) => {
      setQueue(q)
    })
  }, [])

  async function handleManualSync() {
    try {
      setSyncing(true)
      await offlineSync.syncAll()
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      {/* Apple 44px Global Nav (Pure Black) */}
      <nav className={styles.globalNav}>
        <div className={styles.globalNavLeft}>
          <span className={styles.globalNavLogo}>{brandTitle}</span>
          <span style={{ color: "var(--ink-muted-48)" }}>|</span>
          <span style={{ color: "var(--body-muted)" }}>{user.name}</span>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              padding: "1px 5px",
              borderRadius: "4px",
              background: "rgba(255, 255, 255, 0.15)",
              color: "#ffffff",
            }}
          >
            {user.role}
          </span>
        </div>

        <div className={styles.globalNavRight}>
          {/* 1-Click Demo Seed Button */}
          {onSeedDemo && (
            <button
              type="button"
              onClick={onSeedDemo}
              disabled={seeding}
              className={styles.globalNavUtilityBtn}
              style={{ background: "rgba(0, 102, 204, 0.3)", color: "var(--primary-on-dark)", border: "1px solid rgba(0, 102, 204, 0.4)" }}
              title="Populate fresh demo inventory, orders & routes"
            >
              <Sparkles size={11} className={seeding ? styles.spin : ""} />
              <span>{seeding ? "Seeding..." : "Demo Data"}</span>
            </button>
          )}

          {/* Offline Queue Badge */}
          {queue.length > 0 && (
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncing || !isOnline}
              className={styles.globalNavUtilityBtn}
              style={{ background: "#f59e0b", color: "#000000", fontWeight: 600 }}
              title="Actions queued offline. Tap to sync."
            >
              <RefreshCw size={11} className={syncing ? styles.spin : ""} />
              <span>{syncing ? "Syncing..." : `${queue.length} Queued`}</span>
            </button>
          )}

          <div className={styles.globalNavStatus}>
            {isOnline ? (
              <>
                <Wifi size={12} style={{ color: "#34d399" }} />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff size={12} style={{ color: "#f87171" }} />
                <span>Offline</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className={styles.globalNavUtilityBtn}
            title="Sign Out"
          >
            <LogOut size={12} />
            <span>Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Apple 52px Frosted Sub-Nav */}
      <header className={styles.subNavFrosted}>
        <h2 className={styles.subNavCategory}>
          {activeMode === "driver" ? "Driver Operations" : "Warehouse Floor"}
        </h2>

        {canSwitchModes && (
          <div className={styles.modeTogglePill}>
            <button
              type="button"
              onClick={() => onModeChange("driver")}
              className={activeMode === "driver" ? styles.modePillBtnActive : styles.modePillBtn}
            >
              <Truck size={14} />
              <span>Driver</span>
            </button>

            <button
              type="button"
              onClick={() => onModeChange("warehouse")}
              className={activeMode === "warehouse" ? styles.modePillBtnActive : styles.modePillBtn}
            >
              <Boxes size={14} />
              <span>Warehouse</span>
            </button>
          </div>
        )}
      </header>
    </>
  )
}
