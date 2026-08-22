"use client"

import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  LogOut,
  Moon,
  Package,
  Route,
  Shield,
  Sun,
  Truck,
  User,
  Wifi,
  WifiOff,
} from "lucide-react"
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
}

export function ModeHeader({
  user,
  company,
  activeMode,
  onModeChange,
  onSignOut,
  isOnline,
}: ModeHeaderProps) {
  const brandTitle = company?.tradingName || company?.name || "SupplySure OS"
  const canSwitchModes = user.role === "admin" || user.role === "warehouse" || user.role === "driver"

  return (
    <header className={styles.appHeader}>
      <div className={styles.headerTop}>
        <div className={styles.headerBrand}>
          <div className={styles.brandLogoIcon}>
            {activeMode === "driver" ? <Truck size={20} /> : <Boxes size={20} />}
          </div>
          <div>
            <h1 className={styles.brandName}>{brandTitle}</h1>
            <div className={styles.userRoleTag}>
              <span className={styles.roleBadge}>{user.role.toUpperCase()}</span>
              <span className={styles.userNameText}>{user.name}</span>
            </div>
          </div>
        </div>

        <div className={styles.headerActions}>
          {/* Online/Offline Status Indicator */}
          <div
            className={isOnline ? styles.onlineIndicator : styles.offlineIndicator}
            title={isOnline ? "Connected to Core Platform" : "Working Offline"}
          >
            {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{isOnline ? "Live" : "Offline"}</span>
          </div>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={onSignOut}
            className={styles.signOutBtn}
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Mode Switcher Toggle Pill */}
      {canSwitchModes && (
        <div className={styles.modeSwitcherContainer}>
          <div className={styles.modeSwitcher}>
            <button
              type="button"
              onClick={() => onModeChange("driver")}
              className={activeMode === "driver" ? styles.modeTabActive : styles.modeTab}
            >
              <Truck size={16} />
              <span>Driver Mode</span>
            </button>

            <button
              type="button"
              onClick={() => onModeChange("warehouse")}
              className={activeMode === "warehouse" ? styles.modeTabActive : styles.modeTab}
            >
              <Boxes size={16} />
              <span>Warehouse Mode</span>
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
