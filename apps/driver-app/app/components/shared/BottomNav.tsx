"use client"

import {
  Boxes,
  Download,
  History,
  ListTodo,
  PackageCheck,
  PackageSearch,
  Send,
  Truck,
  User,
} from "lucide-react"
import styles from "../../page.module.css"

interface BottomNavProps {
  mode: "driver" | "warehouse"
  activeTab: string
  onTabChange: (tab: string) => void
  badges?: {
    driverRoute?: number
    warehousePick?: number
    warehouseReceive?: number
    warehouseDispatch?: number
  }
}

export function BottomNav({ mode, activeTab, onTabChange, badges }: BottomNavProps) {
  if (mode === "driver") {
    return (
      <nav className={styles.floatingStickyBar}>
        <button
          type="button"
          onClick={() => onTabChange("route")}
          className={activeTab === "route" ? styles.bottomNavBtnActive : styles.bottomNavBtn}
        >
          <Truck size={18} />
          <span>Active Run</span>
          {typeof badges?.driverRoute === "number" && badges.driverRoute > 0 && (
            <span className={styles.navBadge}>{badges.driverRoute}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => onTabChange("history")}
          className={activeTab === "history" ? styles.bottomNavBtnActive : styles.bottomNavBtn}
        >
          <PackageCheck size={18} />
          <span>Completed</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("profile")}
          className={activeTab === "profile" ? styles.bottomNavBtnActive : styles.bottomNavBtn}
        >
          <User size={18} />
          <span>Profile</span>
        </button>
      </nav>
    )
  }

  return (
    <nav className={styles.floatingStickyBar}>
      <button
        type="button"
        onClick={() => onTabChange("picking")}
        className={activeTab === "picking" ? styles.bottomNavBtnActive : styles.bottomNavBtn}
      >
        <ListTodo size={18} />
        <span>Picking</span>
        {typeof badges?.warehousePick === "number" && badges.warehousePick > 0 && (
          <span className={styles.navBadge}>{badges.warehousePick}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => onTabChange("receiving")}
        className={activeTab === "receiving" ? styles.bottomNavBtnActive : styles.bottomNavBtn}
      >
        <Download size={18} />
        <span>Receiving</span>
        {typeof badges?.warehouseReceive === "number" && badges.warehouseReceive > 0 && (
          <span className={styles.navBadge}>{badges.warehouseReceive}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => onTabChange("inventory")}
        className={activeTab === "inventory" ? styles.bottomNavBtnActive : styles.bottomNavBtn}
      >
        <PackageSearch size={18} />
        <span>Stock</span>
      </button>

      <button
        type="button"
        onClick={() => onTabChange("dispatch")}
        className={activeTab === "dispatch" ? styles.bottomNavBtnActive : styles.bottomNavBtn}
      >
        <Send size={18} />
        <span>Dispatch</span>
        {typeof badges?.warehouseDispatch === "number" && badges.warehouseDispatch > 0 && (
          <span className={styles.navBadge}>{badges.warehouseDispatch}</span>
        )}
      </button>

      <button
        type="button"
        onClick={() => onTabChange("activity")}
        className={activeTab === "activity" ? styles.bottomNavBtnActive : styles.bottomNavBtn}
      >
        <History size={18} />
        <span>Audit Log</span>
      </button>
    </nav>
  )
}
