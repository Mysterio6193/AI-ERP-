"use client"

import {
  Boxes,
  ClipboardList,
  Download,
  ListTodo,
  PackageCheck,
  PackageSearch,
  Route,
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
      <nav className={styles.bottomNav}>
        <button
          type="button"
          onClick={() => onTabChange("route")}
          className={activeTab === "route" ? styles.navItemActive : styles.navItem}
        >
          <div className={styles.navIconWrap}>
            <Truck size={20} />
            {typeof badges?.driverRoute === "number" && badges.driverRoute > 0 && (
              <span className={styles.navBadge}>{badges.driverRoute}</span>
            )}
          </div>
          <span>Run Sheet</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("history")}
          className={activeTab === "history" ? styles.navItemActive : styles.navItem}
        >
          <div className={styles.navIconWrap}>
            <PackageCheck size={20} />
          </div>
          <span>Completed</span>
        </button>

        <button
          type="button"
          onClick={() => onTabChange("profile")}
          className={activeTab === "profile" ? styles.navItemActive : styles.navItem}
        >
          <div className={styles.navIconWrap}>
            <User size={20} />
          </div>
          <span>Driver Info</span>
        </button>
      </nav>
    )
  }

  return (
    <nav className={styles.bottomNav}>
      <button
        type="button"
        onClick={() => onTabChange("picking")}
        className={activeTab === "picking" ? styles.navItemActive : styles.navItem}
      >
        <div className={styles.navIconWrap}>
          <ListTodo size={20} />
          {typeof badges?.warehousePick === "number" && badges.warehousePick > 0 && (
            <span className={styles.navBadge}>{badges.warehousePick}</span>
          )}
        </div>
        <span>Picking</span>
      </button>

      <button
        type="button"
        onClick={() => onTabChange("receiving")}
        className={activeTab === "receiving" ? styles.navItemActive : styles.navItem}
      >
        <div className={styles.navIconWrap}>
          <Download size={20} />
          {typeof badges?.warehouseReceive === "number" && badges.warehouseReceive > 0 && (
            <span className={styles.navBadge}>{badges.warehouseReceive}</span>
          )}
        </div>
        <span>Receiving</span>
      </button>

      <button
        type="button"
        onClick={() => onTabChange("inventory")}
        className={activeTab === "inventory" ? styles.navItemActive : styles.navItem}
      >
        <div className={styles.navIconWrap}>
          <PackageSearch size={20} />
        </div>
        <span>Stock / Bins</span>
      </button>

      <button
        type="button"
        onClick={() => onTabChange("dispatch")}
        className={activeTab === "dispatch" ? styles.navItemActive : styles.navItem}
      >
        <div className={styles.navIconWrap}>
          <Send size={20} />
          {typeof badges?.warehouseDispatch === "number" && badges.warehouseDispatch > 0 && (
            <span className={styles.navBadge}>{badges.warehouseDispatch}</span>
          )}
        </div>
        <span>Dispatch</span>
      </button>
    </nav>
  )
}
