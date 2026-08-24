import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { SESSION_CACHE_KEY, CACHE_TTL_MS, readCache, writeCache } from "./page"

describe("Dashboard Cache", () => {
  const mockDashboardData: any = {
    todaySales: 1500,
    yesterdaySales: 1200,
    weekSales: 10000,
    previousWeekSales: 9500,
    todayOrders: 5,
    totalOrders: 20,
    commerceOrders: 10,
    websiteOrders: 6,
    appOrders: 4,
    commerceRevenue: 5000,
    openOrders: 3,
    pendingApprovals: 1,
    activeCustomers: 8,
    outstandingReceivables: 3200,
    overdueInvoices: 2,
    lowStockItems: 1,
    lowStockUnitsShort: 4,
    pickQueue: 2,
    picksInProgress: 1,
    routesInProgress: 1,
    remainingStops: 3,
    deliveredToday: 5,
    outstandingCod: 150,
    recentOrders: [],
    lowStockProducts: [],
    topProducts: [],
    topCustomers: [],
    salesTrend: [],
    orderStatusDistribution: [],
    fulfillmentStages: [],
    routeSnapshots: [],
    pickSnapshots: [],
    activityFeed: [],
    openInvoices: [],
  }

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
    vi.useRealTimers()
  })

  it("exports expected constants", () => {
    expect(SESSION_CACHE_KEY).toBe("dashboard_v2")
    expect(CACHE_TTL_MS).toBe(5 * 60 * 1000)
  })

  it("writes to and reads from sessionStorage within TTL", () => {
    writeCache(mockDashboardData)
    const cached = readCache()
    expect(cached).toEqual(mockDashboardData)
  })

  it("returns null when cache is expired (> CACHE_TTL_MS)", () => {
    vi.useFakeTimers()
    const now = Date.now()
    vi.setSystemTime(now)

    writeCache(mockDashboardData)
    expect(readCache()).toEqual(mockDashboardData)

    // Advance beyond 5 minutes
    vi.setSystemTime(now + CACHE_TTL_MS + 1000)
    expect(readCache()).toBeNull()
  })

  it("returns null when storage contains corrupted JSON", () => {
    storageStore[SESSION_CACHE_KEY] = "{ corrupt json "
    expect(readCache()).toBeNull()
  })

  it("returns null when storage contains invalid structure", () => {
    storageStore[SESSION_CACHE_KEY] = JSON.stringify({ wrong: true })
    expect(readCache()).toBeNull()
  })

  it("handles writeCache errors gracefully (e.g. QuotaExceeded)", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError")
        },
      },
    })

    expect(() => writeCache(mockDashboardData)).not.toThrow()
  })
})
