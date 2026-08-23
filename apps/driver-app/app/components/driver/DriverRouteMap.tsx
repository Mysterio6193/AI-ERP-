"use client"

import { useMemo, useState } from "react"
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  Navigation,
  Radio,
  Truck,
  Warehouse,
  X,
} from "lucide-react"
import { DriverRoute, RouteStop } from "./DriverRouteView"
import styles from "../../page.module.css"

interface DriverRouteMapProps {
  route: DriverRoute
  onSelectStop: (stop: RouteStop) => void
}

export function DriverRouteMap({ route, onSelectStop }: DriverRouteMapProps) {
  const [selectedPinIndex, setSelectedPinIndex] = useState<number | null>(null)

  const stops = route.stops || []

  // Synthesize relative SVG coordinates for realistic route topology if lat/lng are missing
  const points = useMemo(() => {
    return stops.map((stop, idx) => {
      const angle = (idx / Math.max(1, stops.length)) * Math.PI * 1.8 + 0.2
      const radius = 100 + (idx % 3) * 35
      const x = 250 + Math.cos(angle) * radius
      const y = 160 + Math.sin(angle) * radius * 0.75
      return { stop, x, y, idx }
    })
  }, [stops])

  const nextStop = stops.find((s) => s.status !== "delivered" && s.status !== "failed") || stops[0]

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Interactive Map Canvas Container */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "340px",
          backgroundColor: "#18181b",
          borderRadius: "18px",
          border: "1px solid var(--hairline)",
          overflow: "hidden",
        }}
      >
        {/* Subtle Map Grid Background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.08) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Live GPS Telemetry Badge */}
        <div
          style={{
            position: "absolute",
            top: "14px",
            left: "14px",
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(10px)",
            padding: "6px 12px",
            borderRadius: "9999px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "12px",
            color: "#ffffff",
            zIndex: 10,
          }}
        >
          <Radio size={13} style={{ color: "#34d399", animation: "pulse 1.5s infinite" }} />
          <span>GPS Connected • Real-Time Run</span>
        </div>

        <svg
          viewBox="0 0 500 320"
          style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
        >
          {/* Route Trajectory Polyline */}
          {points.length > 0 && (
            <>
              {/* Depot Start Connection */}
              <line
                x1="250"
                y1="160"
                x2={points[0]?.x || 250}
                y2={points[0]?.y || 160}
                stroke="#0066cc"
                strokeWidth="3"
                strokeDasharray="6 4"
                opacity="0.8"
              />

              {/* Waypoints Connecting Lines */}
              {points.map((pt, i) => {
                if (i === points.length - 1) return null
                const next = points[i + 1]
                const isTraversed = pt.stop.status === "delivered"
                return (
                  <line
                    key={pt.stop.id}
                    x1={pt.x}
                    y1={pt.y}
                    x2={next.x}
                    y2={next.y}
                    stroke={isTraversed ? "#34d399" : "#0066cc"}
                    strokeWidth={isTraversed ? "3" : "2"}
                    strokeDasharray={isTraversed ? "none" : "5 3"}
                    opacity={isTraversed ? 0.9 : 0.6}
                  />
                )
              })}
            </>
          )}

          {/* Depot / Warehouse Pin */}
          <g transform="translate(250, 160)">
            <circle r="14" fill="#1d1d1f" stroke="#ffffff" strokeWidth="2" />
            <circle r="6" fill="#facc15" />
          </g>

          {/* Stop Waypoint Pins */}
          {points.map(({ stop, x, y, idx }) => {
            const isDelivered = stop.status === "delivered"
            const isEnRoute = stop.status === "en_route" || stop.status === "arrived"
            const isFailed = stop.status === "failed" || stop.status === "returned"

            const pinColor = isDelivered ? "#10b981" : isEnRoute ? "#0066cc" : isFailed ? "#ef4444" : "#f59e0b"

            return (
              <g
                key={stop.id}
                transform={`translate(${x}, ${y})`}
                onClick={() => {
                  setSelectedPinIndex(idx)
                  onSelectStop(stop)
                }}
                style={{ cursor: "pointer" }}
              >
                {/* Active Ripple Animation */}
                {isEnRoute && (
                  <circle r="22" fill="#0066cc" opacity="0.3" className={styles.spin} />
                )}

                <circle
                  r="12"
                  fill={pinColor}
                  stroke="#ffffff"
                  strokeWidth="2"
                  filter="drop-shadow(0 2px 4px rgba(0,0,0,0.5))"
                />
                <text
                  textAnchor="middle"
                  dy="4"
                  fill="#ffffff"
                  fontSize="11"
                  fontWeight="bold"
                  fontFamily="-apple-system, sans-serif"
                >
                  {stop.sequence || idx + 1}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Next Stop HUD Floating Card */}
        {nextStop && (
          <div
            style={{
              position: "absolute",
              bottom: "12px",
              left: "12px",
              right: "12px",
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(20px)",
              borderRadius: "14px",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              zIndex: 10,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span className={styles.cardSequenceBadge}>Next: Stop #{nextStop.sequence}</span>
                <span style={{ fontSize: "12px", color: "var(--ink-muted-48)" }}>
                  {nextStop.etaLabel || "Approx 12 mins"}
                </span>
              </div>
              <h4 style={{ margin: "4px 0 0 0", fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>
                {nextStop.customerName}
              </h4>
              <p style={{ margin: 0, fontSize: "13px", color: "var(--ink-muted-80)" }}>
                {nextStop.address}
              </p>
            </div>

            <button
              type="button"
              onClick={() => onSelectStop(nextStop)}
              className={styles.buttonPrimary}
              style={{ padding: "8px 16px", fontSize: "14px" }}
            >
              <Navigation size={14} />
              <span>Drive</span>
            </button>
          </div>
        )}
      </div>

      {/* Map Waypoint Sequencing List */}
      <div className={styles.utilityCard}>
        <div className={styles.cardHeaderRow}>
          <h3 className={styles.cardTitle}>Route Sequence & Progress</h3>
          <span className={styles.cardTagHighlight}>
            {route.completedStops} / {route.totalStops} Done
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {stops.map((stop, idx) => {
            const isDelivered = stop.status === "delivered"
            const isEnRoute = stop.status === "en_route" || stop.status === "arrived"

            return (
              <div
                key={stop.id}
                onClick={() => onSelectStop(stop)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: isEnRoute ? "rgba(0, 102, 204, 0.06)" : "var(--canvas-parchment)",
                  border: isEnRoute ? "1px solid var(--primary)" : "1px solid var(--hairline)",
                  borderRadius: "11px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      width: "24px",
                      height: "24px",
                      borderRadius: "9999px",
                      background: isDelivered ? "#10b981" : isEnRoute ? "var(--primary)" : "#d2d2d7",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    {isDelivered ? "✓" : stop.sequence || idx + 1}
                  </span>
                  <div>
                    <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>
                      {stop.customerName}
                    </span>
                    <span style={{ display: "block", fontSize: "13px", color: "var(--ink-muted-48)" }}>
                      {stop.address}, {stop.city}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ fontSize: "13px", color: "var(--ink-muted-80)" }}>
                    {stop.items} pkgs
                  </span>
                  <ArrowRight size={14} style={{ color: "var(--ink-muted-48)" }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
