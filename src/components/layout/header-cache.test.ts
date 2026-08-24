import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import {
  NOTIF_CACHE_KEY,
  readNotificationCache,
  writeNotificationCache,
  type HeaderNotification,
} from "./header"

describe("Header Notification Cache", () => {
  const mockNotifications: HeaderNotification[] = [
    {
      id: "notif-1",
      title: "Low stock: SKU-123",
      description: "Only 2 items remaining in warehouse",
      href: "/inventory",
      tone: "critical",
    },
    {
      id: "notif-2",
      title: "Invoice overdue",
      description: "INV-999 is past due date",
      href: "/invoices/999",
      tone: "warning",
    },
  ]

  let storageStore: Record<string, string> = {}

  beforeEach(() => {
    storageStore = {}
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => storageStore[key] ?? null,
        setItem: (key: string, value: string) => {
          storageStore[key] = value
        },
        removeItem: (key: string) => {
          delete storageStore[key]
        },
        clear: () => {
          storageStore = {}
        },
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("exports expected constants", () => {
    expect(NOTIF_CACHE_KEY).toBe("header_notifs_v1")
  })

  it("writes to and reads from sessionStorage", () => {
    writeNotificationCache(mockNotifications)
    const cached = readNotificationCache()
    expect(cached).toEqual(mockNotifications)
  })

  it("returns empty array when nothing cached", () => {
    expect(readNotificationCache()).toEqual([])
  })

  it("returns empty array when storage contains corrupted JSON", () => {
    storageStore[NOTIF_CACHE_KEY] = "{ corrupt json "
    expect(readNotificationCache()).toEqual([])
  })

  it("returns empty array when storage contains invalid structure (not array)", () => {
    storageStore[NOTIF_CACHE_KEY] = JSON.stringify({ wrong: true })
    expect(readNotificationCache()).toEqual([])
  })

  it("handles writeNotificationCache errors gracefully (e.g. QuotaExceeded)", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError")
        },
      },
    })

    expect(() => writeNotificationCache(mockNotifications)).not.toThrow()
  })
})
