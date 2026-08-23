"use client"

import { useMemo, useState } from "react"
import {
  Boxes,
  Compass,
  Footprints,
  Layers,
  MapPin,
  Navigation,
  Sparkles,
} from "lucide-react"
import { PickItem, PickList } from "./WarehousePickingView"
import styles from "../../page.module.css"

interface WarehouseBinMapProps {
  activePickList: PickList | null
  onSelectBin?: (binCode: string) => void
}

interface WarehouseBinZone {
  code: string
  name: string
  zone: "Aisle A" | "Aisle B" | "Aisle C" | "Cold Room" | "Dock"
  x: number
  y: number
  w: number
  h: number
}

const WAREHOUSE_BINS: WarehouseBinZone[] = [
  // Aisle A (Flour & Dry Grains)
  { code: "A-01-A", name: "Flour 00 Tipo 25kg", zone: "Aisle A", x: 40, y: 40, w: 70, h: 40 },
  { code: "A-01-B", name: "Semolina Rimacinata 25kg", zone: "Aisle A", x: 120, y: 40, w: 70, h: 40 },
  { code: "A-02-A", name: "Gluten-Free Pizza Mix", zone: "Aisle A", x: 40, y: 90, w: 70, h: 40 },
  { code: "A-02-B", name: "Dry Active Yeast 500g", zone: "Aisle A", x: 120, y: 90, w: 70, h: 40 },

  // Aisle B (Sauces & Canned Goods)
  { code: "B-01-A", name: "San Marzano D.O.P 2.5kg", zone: "Aisle B", x: 230, y: 40, w: 70, h: 40 },
  { code: "B-01-B", name: "Pizza Sauce Base 4kg", zone: "Aisle B", x: 310, y: 40, w: 70, h: 40 },
  { code: "B-02-A", name: "Extra Virgin Olive Oil 5L", zone: "Aisle B", x: 230, y: 90, w: 70, h: 40 },
  { code: "B-02-B", name: "Kalamata Pitted Olives 2kg", zone: "Aisle B", x: 310, y: 90, w: 70, h: 40 },

  // Aisle C (Packaging & Boxes)
  { code: "C-01-A", name: "Pizza Box 11 inch (x100)", zone: "Aisle C", x: 40, y: 160, w: 70, h: 40 },
  { code: "C-01-B", name: "Pizza Box 13 inch (x100)", zone: "Aisle C", x: 120, y: 160, w: 70, h: 40 },
  { code: "C-02-A", name: "Pizza Box 15 inch (x100)", zone: "Aisle C", x: 40, y: 210, w: 70, h: 40 },
  { code: "C-02-B", name: "Greaseproof Liners (x500)", zone: "Aisle C", x: 120, y: 210, w: 70, h: 40 },

  // Cold Room (Dairy & Smallgoods)
  { code: "CR-01", name: "Fior Di Latte Shredded 2kg", zone: "Cold Room", x: 230, y: 160, w: 150, h: 42 },
  { code: "CR-02", name: "Fresh Buffalo Mozzarella", zone: "Cold Room", x: 230, y: 208, w: 150, h: 42 },

  // Dispatch & Staging
  { code: "STAGE-01", name: "Dispatch Staging Bay", zone: "Dock", x: 410, y: 40, w: 60, h: 210 },
]

export function WarehouseBinMap({ activePickList, onSelectBin }: WarehouseBinMapProps) {
  const [selectedBin, setSelectedBin] = useState<WarehouseBinZone | null>(null)

// Location alias mapping: demo data / database locations -> bin map codes
const LOCATION_ALIASES: Record<string, string> = {
  "COLD-ROOM-01": "CR-01",
  "COLD-ROOM-02": "CR-02",
  "COLD-ROOM-03": "CR-01",
  "AISLE-A-01": "A-01-A",
  "AISLE-A-02": "A-01-B",
  "AISLE-A-03": "A-02-A",
  "AISLE-A-04": "A-02-B",
  "AISLE-B-01": "B-01-A",
  "AISLE-B-02": "B-01-B",
  "AISLE-B-03": "B-02-A",
  "AISLE-B-04": "B-02-B",
  "AISLE-C-01": "C-01-A",
  "AISLE-C-02": "C-01-B",
  "AISLE-C-03": "C-02-A",
  "AISLE-C-04": "C-02-B",
  "STAGING": "STAGE-01",
  "DISPATCH-BAY": "STAGE-01",
}

  // Find which bins contain items from the active pick list
  const activeBinsMap = useMemo(() => {
    const map = new Map<string, PickItem>()
    if (activePickList) {
      activePickList.items.forEach((item) => {
        if (item.location) {
          const loc = item.location.toUpperCase()
          // Try direct match first, then alias
          map.set(loc, item)
          const aliased = LOCATION_ALIASES[loc]
          if (aliased) {
            map.set(aliased, item)
          }
        }
      })
    }
    return map
  }, [activePickList])

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div className={styles.utilityCard} style={{ padding: "20px" }}>
        <div className={styles.cardHeaderRow}>
          <div>
            <span className={styles.heroTaglineLight}>Path Optimization</span>
            <h3 className={styles.cardTitle} style={{ marginTop: "2px" }}>
              Warehouse Floor & Bin Map
            </h3>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Sparkles size={14} style={{ color: "var(--primary)" }} />
            <span style={{ fontSize: "12px", color: "var(--primary)", fontWeight: 600 }}>
              Optimal Pick Route Active
            </span>
          </div>
        </div>

        {/* Interactive Floor SVG Plan */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "280px",
            background: "#1c1917",
            borderRadius: "14px",
            overflow: "hidden",
            marginTop: "12px",
          }}
        >
          <svg viewBox="0 0 490 270" style={{ width: "100%", height: "100%" }}>
            {/* Zone Labels */}
            <text x="70" y="24" fill="#a8a29e" fontSize="11" fontWeight="600">
              AISLE A (Flour)
            </text>
            <text x="260" y="24" fill="#a8a29e" fontSize="11" fontWeight="600">
              AISLE B (Sauces)
            </text>
            <text x="70" y="150" fill="#a8a29e" fontSize="11" fontWeight="600">
              AISLE C (Packaging)
            </text>
            <text x="260" y="150" fill="#38bdf8" fontSize="11" fontWeight="600">
              COLD ROOM (-2°C)
            </text>
            <text
              x="440"
              y="150"
              fill="#facc15"
              fontSize="11"
              fontWeight="600"
              transform="rotate(90, 440, 150)"
            >
              DISPATCH BAY
            </text>

            {/* Bins Rendering */}
            {WAREHOUSE_BINS.map((bin) => {
              const pickItem = activeBinsMap.get(bin.code)
              const hasItemToPick = Boolean(pickItem)
              const isPicked = pickItem && pickItem.pickedQty >= pickItem.requiredQty
              const isSelected = selectedBin?.code === bin.code

              const fillColor = isPicked
                ? "#065f46"
                : hasItemToPick
                ? "#0284c7"
                : isSelected
                ? "#44403c"
                : "#292524"

              const strokeColor = hasItemToPick ? "#38bdf8" : isSelected ? "#ffffff" : "#44403c"

              return (
                <g
                  key={bin.code}
                  transform={`translate(${bin.x}, ${bin.y})`}
                  onClick={() => {
                    setSelectedBin(bin)
                    onSelectBin?.(bin.code)
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <rect
                    width={bin.w}
                    height={bin.h}
                    rx="6"
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={hasItemToPick ? 2 : 1}
                  />
                  <text
                    x={bin.w / 2}
                    y={bin.h / 2 + 4}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="600"
                    fontFamily="-apple-system, sans-serif"
                  >
                    {bin.code}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* Selected Bin Preview */}
        {selectedBin && (
          <div
            style={{
              marginTop: "12px",
              padding: "12px 16px",
              background: "var(--canvas-parchment)",
              borderRadius: "11px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <span className={styles.cardSequenceBadge}>{selectedBin.code}</span>
              <h4 style={{ margin: "4px 0 0 0", fontSize: "15px", fontWeight: 600 }}>
                {selectedBin.name}
              </h4>
              <p style={{ margin: 0, fontSize: "12px", color: "var(--ink-muted-48)" }}>
                Zone: {selectedBin.zone}
              </p>
            </div>

            {activeBinsMap.has(selectedBin.code) && (
              <span className={styles.cardTagHighlight}>Active Pick Line Target</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
