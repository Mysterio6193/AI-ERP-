# Autonomous Command Terminal — Visual Design System

## 1. Aesthetic Direction & Thesis
- **Thesis**: An Autonomous Operations Command Terminal that replaces generic white/gray SaaS templates with high-precision, luminous glass telemetry and live event pipelines.
- **Form**: Autonomous Command Terminal (Candidate 4, Seed `1af67f24`, Mode `operate`).
- **Canvas**: Deep Obsidian & Ink (`#070a12`) with frosted card surfaces (`#0b101d`), luminous borders (`rgba(255,255,255,0.08)` / `border-border/80`), and electric blue (`#3b82f6`) & emerald (`#10b981`) telemetry pulses.

---

## 2. Color Palette & Elevation

| Token | Hex / Value | Semantic Role |
| :--- | :--- | :--- |
| `--background` | `#070a12` | Deep Obsidian Canvas |
| `--card` | `#0b101d` | Frosted Glass Panel Fill |
| `--popover` | `#0c1222` | Modal & Dropdown Surface |
| `--border` | `#1a233a` | High-Precision Panel Outline |
| `--primary` | `#3b82f6` | Sapphire Telemetry Accent |
| `--emerald` | `#10b981` | Live Pulse & Positive Velocity |
| `--amber` | `#f59e0b` | Attention / Warning Signals |
| `--rose` | `#f43f5e` | Critical / Overdue State |
| `--purple` | `#8b5cf6` | Omnichannel & AI Operations |

---

## 3. Core Component Language

### A. Navigation & Shell
- **Header**: Sticky glass header (`backdrop-blur-xl bg-background/80`) featuring real-time AI Heartbeat status pill (`● AI Core Live`), quick command search pill (`⌘K`), and dark notification badge drawer.
- **Sidebar**: Frosted Obsidian rail (`bg-sidebar`) with illuminated brand badge, group headers, and active state pills with subtle primary glow.

### B. Telemetry Matrix (KPI Cards)
- **Geometry**: `rounded-2xl` frosted cards with dynamic radial gradient top-glow.
- **Typography**: Bold mono-compatible numerals with micro uppercase category headers.
- **Delta Indicators**: Pill badges with directional icons and colored background tints (`+14.2% vs yesterday`).

### C. Live Operations Pipeline
- **Fulfillment Radar**: Real-time progress bar tracking order stages (`Order Received` → `Picking` → `Packed` → `Dispatched` → `Delivered` → `Settled`).
- **Telemetry Charts**: High-contrast multi-line and bar charts with frosted dark tooltip overlays and vibrant spline curves.

---

## 4. Quality Floor & Invariants
- High-contrast text readability on every input, select trigger, dropdown, table, and tab.
- All cards feature consistent elevation, rounded corners (`rounded-2xl`), and subtle borders (`border-border/80`).
- No flash of unstyled light content in dark command mode.
