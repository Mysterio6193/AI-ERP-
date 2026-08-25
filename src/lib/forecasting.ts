/**
 * Pure statistical demand forecasting and inventory replenishment analytics.
 *
 * Provides run-rate analysis, safety stock calculations with lead-time variability,
 * stockout risk estimation, seasonality detection, and forward demand projections.
 *
 * Designed as pure mathematical functions that accept raw data arrays so they can
 * be tested deterministically in isolation without database dependencies.
 */

export interface SalesDataPoint {
  date: Date | string
  quantity: number
}

export interface RunRateAnalysis {
  totalUnits: number
  totalDays: number
  avgDailyDemand: number
  stdDevDailyDemand: number
  trend: "increasing" | "decreasing" | "stable"
  velocityChangePercent: number
}

export interface StockoutRiskAnalysis {
  currentStock: number
  onOrder: number
  effectiveStock: number
  avgDailyDemand: number
  leadTimeDays: number
  daysUntilStockout: number
  projectedStockoutDate: Date | null
  riskLevel: "CRITICAL" | "WARNING" | "HEALTHY"
  safetyStock: number
  reorderPoint: number
  suggestedReorderQty: number
}

export interface DemandAnomaly {
  date: string
  quantity: number
  expectedDaily: number
  deviationSigma: number
  type: "spike" | "drop"
}

export interface SeasonalityAnalysis {
  dayOfWeekDistribution: Record<string, number>
  peakDay: string
  lowDay: string
  weekdayAvg: number
  weekendAvg: number
  weekendToWeekdayRatio: number
  seasonalityStrength: "high" | "moderate" | "low"
}

export interface ForecastPoint {
  date: string
  projectedDemand: number
  lowerBound: number
  upperBound: number
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

/**
 * Normalizes and aggregates sales history into a map of YYYY-MM-DD -> quantity.
 */
export function aggregateSalesByDay(history: SalesDataPoint[]): Map<string, number> {
  const dailyMap = new Map<string, number>()

  for (const point of history) {
    if (!point || point.quantity <= 0) continue
    const d = typeof point.date === "string" ? new Date(point.date) : point.date
    if (isNaN(d.getTime())) continue

    const key = d.toISOString().split("T")[0]
    dailyMap.set(key, (dailyMap.get(key) || 0) + point.quantity)
  }

  return dailyMap
}

/**
 * Calculates daily sales velocity, standard deviation, and trend over a time window.
 */
export function calculateDailyRunRate(
  history: SalesDataPoint[],
  windowDays = 30
): RunRateAnalysis {
  const effectiveWindow = Math.max(1, windowDays)
  const dailyMap = aggregateSalesByDay(history)

  const totalUnits = Array.from(dailyMap.values()).reduce((sum, qty) => sum + qty, 0)
  const avgDailyDemand = Number((totalUnits / effectiveWindow).toFixed(2))

  // Calculate variance across all calendar days in the window (including 0 sales days)
  let sumSquaredDiff = 0
  for (let i = 0; i < effectiveWindow; i++) {
    // Treat days without orders as 0 units sold for accurate daily mean variance
    const count = i < dailyMap.size ? Array.from(dailyMap.values())[i] || 0 : 0
    sumSquaredDiff += Math.pow(count - avgDailyDemand, 2)
  }
  const variance = sumSquaredDiff / effectiveWindow
  const stdDevDailyDemand = Number(Math.sqrt(variance).toFixed(2))

  // Determine trend by comparing the most recent half of the window with the older half
  const sortedDates = Array.from(dailyMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  if (sortedDates.length < 2) {
    return {
      totalUnits,
      totalDays: effectiveWindow,
      avgDailyDemand,
      stdDevDailyDemand,
      trend: "stable",
      velocityChangePercent: 0,
    }
  }

  const midpoint = Math.floor(sortedDates.length / 2)
  const firstHalfTotal = sortedDates.slice(0, midpoint).reduce((sum, [, qty]) => sum + qty, 0)
  const secondHalfTotal = sortedDates.slice(midpoint).reduce((sum, [, qty]) => sum + qty, 0)

  const firstHalfAvg = firstHalfTotal / Math.max(1, midpoint)
  const secondHalfAvg = secondHalfTotal / Math.max(1, sortedDates.length - midpoint)

  let velocityChangePercent = 0
  if (firstHalfAvg > 0) {
    velocityChangePercent = Number((((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100).toFixed(1))
  } else if (secondHalfAvg > 0) {
    velocityChangePercent = 100
  }

  let trend: "increasing" | "decreasing" | "stable" = "stable"
  if (velocityChangePercent >= 15) {
    trend = "increasing"
  } else if (velocityChangePercent <= -15) {
    trend = "decreasing"
  }

  return {
    totalUnits,
    totalDays: effectiveWindow,
    avgDailyDemand,
    stdDevDailyDemand,
    trend,
    velocityChangePercent,
  }
}

/**
 * Calculates safety stock to buffer against lead time demand variability.
 * Formula: Safety Stock = Z * stdDev * sqrt(leadTime)
 *
 * @param leadTimeDays Supplier lead time in days (minimum 1)
 * @param stdDevDailyDemand Standard deviation of daily demand
 * @param serviceLevelZ Z-score for target service level (default 1.65 for 95% service level)
 */
export function calculateSafetyStock(
  leadTimeDays: number,
  stdDevDailyDemand: number,
  serviceLevelZ = 1.65
): number {
  if (leadTimeDays <= 0 || stdDevDailyDemand <= 0) {
    return 0
  }
  const rawSafety = serviceLevelZ * stdDevDailyDemand * Math.sqrt(leadTimeDays)
  return Math.ceil(rawSafety)
}

/**
 * Calculates the inventory reorder point.
 * Formula: Reorder Point = (Avg Daily Demand * Lead Time) + Safety Stock
 */
export function calculateReorderPoint(
  avgDailyDemand: number,
  leadTimeDays: number,
  safetyStock: number
): number {
  const leadTimeDemand = Math.max(0, avgDailyDemand) * Math.max(1, leadTimeDays)
  return Math.ceil(leadTimeDemand + Math.max(0, safetyStock))
}

/**
 * Evaluates stockout risk and determines replenishment requirements.
 */
export function calculateStockoutRisk(params: {
  currentStock: number
  onOrder: number
  avgDailyDemand: number
  leadTimeDays: number
  stdDevDailyDemand?: number
  minOrderQty?: number
  targetCycleDays?: number
  referenceDate?: Date
}): StockoutRiskAnalysis {
  const {
    currentStock,
    onOrder,
    avgDailyDemand,
    leadTimeDays,
    stdDevDailyDemand = 0,
    minOrderQty = 1,
    targetCycleDays = 30,
    referenceDate = new Date(),
  } = params

  const effectiveStock = currentStock + onOrder
  const safetyStock = calculateSafetyStock(leadTimeDays, stdDevDailyDemand)
  const reorderPoint = calculateReorderPoint(avgDailyDemand, leadTimeDays, safetyStock)

  let daysUntilStockout = 999
  let projectedStockoutDate: Date | null = null

  if (avgDailyDemand > 0) {
    daysUntilStockout = Math.max(0, Number((currentStock / avgDailyDemand).toFixed(1)))
    projectedStockoutDate = new Date(referenceDate.getTime() + Math.floor(daysUntilStockout) * 86400000)
  }

  // Risk categorization:
  // - CRITICAL: stock runs out before or by the time a new order would arrive (daysUntilStockout <= leadTimeDays)
  // - WARNING: available stock is at or below the reorder point
  // - HEALTHY: stock is comfortably above the reorder point
  let riskLevel: "CRITICAL" | "WARNING" | "HEALTHY" = "HEALTHY"
  if (currentStock <= 0 || (avgDailyDemand > 0 && daysUntilStockout <= leadTimeDays)) {
    riskLevel = "CRITICAL"
  } else if (currentStock <= reorderPoint) {
    riskLevel = "WARNING"
  }

  // Calculate suggested reorder quantity to reach target cycle coverage plus safety stock
  let suggestedReorderQty = 0
  if (riskLevel !== "HEALTHY" || effectiveStock <= reorderPoint) {
    const targetStock = Math.ceil(avgDailyDemand * targetCycleDays) + safetyStock
    const rawSuggested = Math.max(0, targetStock - effectiveStock)
    suggestedReorderQty = Math.max(rawSuggested > 0 ? minOrderQty : 0, rawSuggested)
  }

  return {
    currentStock,
    onOrder,
    effectiveStock,
    avgDailyDemand,
    leadTimeDays,
    daysUntilStockout,
    projectedStockoutDate,
    riskLevel,
    safetyStock,
    reorderPoint,
    suggestedReorderQty,
  }
}

/**
 * Detects demand anomalies (spikes or drops) that deviate by more than thresholdSigma.
 */
export function detectDemandAnomalies(
  history: SalesDataPoint[],
  thresholdSigma = 2.0
): DemandAnomaly[] {
  const dailyMap = aggregateSalesByDay(history)
  if (dailyMap.size < 4) return []

  const quantities = Array.from(dailyMap.values())
  const mean = quantities.reduce((sum, q) => sum + q, 0) / quantities.length

  const variance =
    quantities.reduce((sum, q) => sum + Math.pow(q - mean, 2), 0) / quantities.length
  const stdDev = Math.sqrt(variance)

  if (stdDev === 0) return []

  const anomalies: DemandAnomaly[] = []

  for (const [date, quantity] of dailyMap.entries()) {
    const diff = quantity - mean
    const sigma = Math.abs(diff) / stdDev

    if (sigma >= thresholdSigma) {
      anomalies.push({
        date,
        quantity,
        expectedDaily: Number(mean.toFixed(1)),
        deviationSigma: Number(sigma.toFixed(2)),
        type: diff > 0 ? "spike" : "drop",
      })
    }
  }

  return anomalies.sort((a, b) => b.deviationSigma - a.deviationSigma)
}

/**
 * Analyzes day-of-week consumption patterns (e.g. restaurant ordering surges).
 */
export function detectSeasonality(history: SalesDataPoint[]): SeasonalityAnalysis {
  const dayTotals = [0, 0, 0, 0, 0, 0, 0] // Sun=0, Mon=1, ..., Sat=6
  const dayCounts = [0, 0, 0, 0, 0, 0, 0]

  for (const point of history) {
    if (!point || point.quantity <= 0) continue
    const d = typeof point.date === "string" ? new Date(point.date) : point.date
    if (isNaN(d.getTime())) continue

    const day = d.getDay()
    dayTotals[day] += point.quantity
    dayCounts[day] += 1
  }

  const totalUnits = dayTotals.reduce((sum, q) => sum + q, 0)

  const dayOfWeekDistribution: Record<string, number> = {}
  let peakDay = DAY_NAMES[1]
  let lowDay = DAY_NAMES[1]
  let maxPercent = -1
  let minPercent = 999

  DAY_NAMES.forEach((name, index) => {
    const percent = totalUnits > 0 ? Number(((dayTotals[index] / totalUnits) * 100).toFixed(1)) : 0
    dayOfWeekDistribution[name] = percent

    if (percent > maxPercent) {
      maxPercent = percent
      peakDay = name
    }
    if (percent < minPercent) {
      minPercent = percent
      lowDay = name
    }
  })

  // Weekdays: Mon(1) to Fri(5), Weekends: Sun(0) and Sat(6)
  const weekdayUnits = dayTotals[1] + dayTotals[2] + dayTotals[3] + dayTotals[4] + dayTotals[5]
  const weekendUnits = dayTotals[0] + dayTotals[6]

  const weekdayAvg = Number((weekdayUnits / 5).toFixed(1))
  const weekendAvg = Number((weekendUnits / 2).toFixed(1))
  const weekendToWeekdayRatio = weekdayAvg > 0 ? Number((weekendAvg / weekdayAvg).toFixed(2)) : 0

  let seasonalityStrength: "high" | "moderate" | "low" = "low"
  if (maxPercent - minPercent >= 15 || weekendToWeekdayRatio >= 1.5 || weekendToWeekdayRatio <= 0.4) {
    seasonalityStrength = "high"
  } else if (maxPercent - minPercent >= 8) {
    seasonalityStrength = "moderate"
  }

  return {
    dayOfWeekDistribution,
    peakDay,
    lowDay,
    weekdayAvg,
    weekendAvg,
    weekendToWeekdayRatio,
    seasonalityStrength,
  }
}

/**
 * Generates forward-looking demand projections with statistical confidence intervals.
 */
export function generateStatisticalForecast(
  history: SalesDataPoint[],
  horizonDays = 30,
  referenceDate = new Date()
): ForecastPoint[] {
  const days = Math.max(1, Math.min(90, horizonDays))
  const runRate = calculateDailyRunRate(history, 60)
  const seasonality = detectSeasonality(history)

  const forecast: ForecastPoint[] = []

  for (let i = 1; i <= days; i++) {
    const forecastDate = new Date(referenceDate.getTime() + i * 86400000)
    const dayName = DAY_NAMES[forecastDate.getDay()]
    const dayShare = (seasonality.dayOfWeekDistribution[dayName] || (100 / 7)) / (100 / 7)

    // Adjust baseline daily demand by day-of-week seasonality multiplier
    const projectedDemand = Number((runRate.avgDailyDemand * dayShare).toFixed(1))
    const margin = Number((runRate.stdDevDailyDemand * 1.28).toFixed(1)) // 80% confidence interval

    forecast.push({
      date: forecastDate.toISOString().split("T")[0],
      projectedDemand,
      lowerBound: Math.max(0, Number((projectedDemand - margin).toFixed(1))),
      upperBound: Number((projectedDemand + margin).toFixed(1)),
    })
  }

  return forecast
}
