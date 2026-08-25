import { describe, expect, it } from "vitest"

import {
  aggregateSalesByDay,
  calculateDailyRunRate,
  calculateReorderPoint,
  calculateSafetyStock,
  calculateStockoutRisk,
  detectDemandAnomalies,
  detectSeasonality,
  generateStatisticalForecast,
} from "./forecasting"

describe("aggregateSalesByDay", () => {
  it("aggregates multiple orders on the same calendar day", () => {
    const history = [
      { date: "2026-03-01T10:00:00Z", quantity: 5 },
      { date: "2026-03-01T14:30:00Z", quantity: 15 },
      { date: "2026-03-02T09:15:00Z", quantity: 10 },
    ]
    const map = aggregateSalesByDay(history)
    expect(map.get("2026-03-01")).toBe(20)
    expect(map.get("2026-03-02")).toBe(10)
  })

  it("ignores zero or negative quantities", () => {
    const history = [
      { date: "2026-03-01T10:00:00Z", quantity: 0 },
      { date: "2026-03-01T12:00:00Z", quantity: -5 },
      { date: "2026-03-01T14:00:00Z", quantity: 8 },
    ]
    const map = aggregateSalesByDay(history)
    expect(map.get("2026-03-01")).toBe(8)
  })
})

describe("calculateDailyRunRate", () => {
  it("calculates average daily velocity across the time window", () => {
    const history = [
      { date: "2026-03-01", quantity: 30 },
      { date: "2026-03-02", quantity: 30 },
      { date: "2026-03-03", quantity: 30 },
    ]
    const rate = calculateDailyRunRate(history, 30)
    expect(rate.totalUnits).toBe(90)
    expect(rate.avgDailyDemand).toBe(3) // 90 units / 30 days
    expect(rate.totalDays).toBe(30)
  })

  it("detects an increasing trend when recent sales velocity rises", () => {
    const history = [
      { date: "2026-03-01", quantity: 5 },
      { date: "2026-03-02", quantity: 5 },
      { date: "2026-03-03", quantity: 25 },
      { date: "2026-03-04", quantity: 30 },
    ]
    const rate = calculateDailyRunRate(history, 4)
    expect(rate.trend).toBe("increasing")
    expect(rate.velocityChangePercent).toBeGreaterThan(0)
  })

  it("detects a decreasing trend when sales velocity falls", () => {
    const history = [
      { date: "2026-03-01", quantity: 40 },
      { date: "2026-03-02", quantity: 35 },
      { date: "2026-03-03", quantity: 5 },
      { date: "2026-03-04", quantity: 2 },
    ]
    const rate = calculateDailyRunRate(history, 4)
    expect(rate.trend).toBe("decreasing")
    expect(rate.velocityChangePercent).toBeLessThan(-15)
  })
})

describe("calculateSafetyStock", () => {
  it("returns 0 when lead time or stdDev is 0", () => {
    expect(calculateSafetyStock(0, 5)).toBe(0)
    expect(calculateSafetyStock(7, 0)).toBe(0)
  })

  it("scales safety stock with lead time and demand variability", () => {
    // Z = 1.65, stdDev = 4, leadTime = 9 -> 1.65 * 4 * 3 = 19.8 -> ceil 20
    const safety = calculateSafetyStock(9, 4, 1.65)
    expect(safety).toBe(20)
  })
})

describe("calculateReorderPoint", () => {
  it("combines lead time demand with safety stock", () => {
    // 10 units/day * 5 days lead time + 15 safety stock = 65
    const rop = calculateReorderPoint(10, 5, 15)
    expect(rop).toBe(65)
  })
})

describe("calculateStockoutRisk", () => {
  const refDate = new Date("2026-03-15T00:00:00Z")

  it("flags CRITICAL risk when stock will run out within lead time", () => {
    const risk = calculateStockoutRisk({
      currentStock: 15,
      onOrder: 0,
      avgDailyDemand: 5,
      leadTimeDays: 7, // Runs out in 3 days, lead time is 7 days
      stdDevDailyDemand: 2,
      referenceDate: refDate,
    })

    expect(risk.riskLevel).toBe("CRITICAL")
    expect(risk.daysUntilStockout).toBe(3)
    expect(risk.projectedStockoutDate?.toISOString().split("T")[0]).toBe("2026-03-18")
    expect(risk.suggestedReorderQty).toBeGreaterThan(0)
  })

  it("flags WARNING when stock is below the reorder point but not immediate critical", () => {
    // avgDailyDemand = 4, leadTime = 2, safetyStock = 3 -> ROP = 11
    const risk = calculateStockoutRisk({
      currentStock: 11, // 11 <= 11 ROP, and 11 / 4 = 2.8 days > 2 days lead time
      onOrder: 0,
      avgDailyDemand: 4,
      leadTimeDays: 2,
      stdDevDailyDemand: 1,
      referenceDate: refDate,
    })

    expect(risk.riskLevel).toBe("WARNING")
  })

  it("marks as HEALTHY when stock comfortably exceeds reorder point", () => {
    const risk = calculateStockoutRisk({
      currentStock: 200,
      onOrder: 50,
      avgDailyDemand: 5,
      leadTimeDays: 5,
      stdDevDailyDemand: 2,
      referenceDate: refDate,
    })

    expect(risk.riskLevel).toBe("HEALTHY")
    expect(risk.daysUntilStockout).toBe(40)
  })
})

describe("detectDemandAnomalies", () => {
  it("detects unusual sales spikes exceeding 2 standard deviations", () => {
    const history = [
      { date: "2026-03-01", quantity: 10 },
      { date: "2026-03-02", quantity: 12 },
      { date: "2026-03-03", quantity: 11 },
      { date: "2026-03-04", quantity: 10 },
      { date: "2026-03-05", quantity: 95 }, // Massive spike
      { date: "2026-03-06", quantity: 11 },
    ]

    const anomalies = detectDemandAnomalies(history, 2.0)
    expect(anomalies.length).toBeGreaterThan(0)
    expect(anomalies[0].date).toBe("2026-03-05")
    expect(anomalies[0].type).toBe("spike")
  })
})

describe("detectSeasonality", () => {
  it("identifies peak ordering days of the week", () => {
    // 2026-03-06 is Friday, 2026-03-07 is Saturday
    const history = [
      { date: "2026-03-02", quantity: 10 }, // Mon
      { date: "2026-03-03", quantity: 10 }, // Tue
      { date: "2026-03-04", quantity: 10 }, // Wed
      { date: "2026-03-05", quantity: 15 }, // Thu
      { date: "2026-03-06", quantity: 80 }, // Fri (Peak)
      { date: "2026-03-07", quantity: 70 }, // Sat
      { date: "2026-03-08", quantity: 5 }, // Sun
    ]

    const seasonality = detectSeasonality(history)
    expect(seasonality.peakDay).toBe("Friday")
    expect(seasonality.dayOfWeekDistribution["Friday"]).toBeGreaterThan(30)
  })
})

describe("generateStatisticalForecast", () => {
  it("generates forward projections with upper and lower bounds", () => {
    const refDate = new Date("2026-03-10T00:00:00Z")
    const history = [
      { date: "2026-03-01", quantity: 20 },
      { date: "2026-03-02", quantity: 20 },
      { date: "2026-03-03", quantity: 25 },
    ]

    const forecast = generateStatisticalForecast(history, 7, refDate)
    expect(forecast.length).toBe(7)
    expect(forecast[0].date).toBe("2026-03-11")
    expect(forecast[0].projectedDemand).toBeGreaterThan(0)
    expect(forecast[0].upperBound).toBeGreaterThanOrEqual(forecast[0].projectedDemand)
    expect(forecast[0].lowerBound).toBeLessThanOrEqual(forecast[0].projectedDemand)
  })
})
