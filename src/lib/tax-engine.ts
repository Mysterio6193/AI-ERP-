// SupplySure OS - Tax Calculation Engine
// Handles tax computation for both Australia and India

import { type CountryCode } from "./types"

// ============================================
// Tax Calculation Result
// ============================================

export interface TaxBreakdown {
    subtotal: number
    taxLines: TaxLine[]
    totalTax: number
    grandTotal: number
}

export interface TaxLine {
    name: string
    code: string
    rate: number
    amount: number
}

// ============================================
// Australia Tax Calculation
// ============================================

function calculateAustralianTax(subtotal: number, gstRate: number = 10): TaxBreakdown {
    if (gstRate === 0) {
        return {
            subtotal,
            taxLines: [{ name: "GST Free", code: "AU_GST_FREE", rate: 0, amount: 0 }],
            totalTax: 0,
            grandTotal: subtotal,
        }
    }

    const gstAmount = subtotal * (gstRate / 100)
    return {
        subtotal,
        taxLines: [{ name: `GST (${gstRate}%)`, code: "AU_GST", rate: gstRate, amount: gstAmount }],
        totalTax: gstAmount,
        grandTotal: subtotal + gstAmount,
    }
}

// ============================================
// India Tax Calculation
// ============================================

function calculateIndianTax(
    subtotal: number,
    gstRate: number,
    fromState: string,
    toState: string,
    cessRate: number = 0
): TaxBreakdown {
    const isInterState = fromState !== toState
    const taxLines: TaxLine[] = []

    if (gstRate === 0) {
        return {
            subtotal,
            taxLines: [{ name: "Exempt", code: "IN_EXEMPT", rate: 0, amount: 0 }],
            totalTax: 0,
            grandTotal: subtotal,
        }
    }

    if (isInterState) {
        // IGST for inter-state transactions
        const igstAmount = subtotal * (gstRate / 100)
        taxLines.push({
            name: `IGST (${gstRate}%)`,
            code: "IN_IGST",
            rate: gstRate,
            amount: igstAmount,
        })
    } else {
        // CGST + SGST for intra-state transactions
        const halfRate = gstRate / 2
        const halfAmount = subtotal * (halfRate / 100)
        taxLines.push(
            { name: `CGST (${halfRate}%)`, code: "IN_CGST", rate: halfRate, amount: halfAmount },
            { name: `SGST (${halfRate}%)`, code: "IN_SGST", rate: halfRate, amount: halfAmount }
        )
    }

    // Add cess if applicable
    if (cessRate > 0) {
        const cessAmount = subtotal * (cessRate / 100)
        taxLines.push({
            name: `Cess (${cessRate}%)`,
            code: "IN_CESS",
            rate: cessRate,
            amount: cessAmount,
        })
    }

    const totalTax = taxLines.reduce((sum, line) => sum + line.amount, 0)

    return {
        subtotal,
        taxLines,
        totalTax,
        grandTotal: subtotal + totalTax,
    }
}

// ============================================
// Main Tax Calculator
// ============================================

export function calculateTax(params: {
    country: CountryCode
    subtotal: number
    gstRate: number
    fromState?: string
    toState?: string
    cessRate?: number
}): TaxBreakdown {
    const { country, subtotal, gstRate, fromState = "", toState = "", cessRate = 0 } = params

    if (country === "IN") {
        return calculateIndianTax(subtotal, gstRate, fromState, toState, cessRate)
    }

    return calculateAustralianTax(subtotal, gstRate)
}

// ============================================
// Extract GST from inclusive amount
// ============================================

export function extractGSTFromInclusive(
    inclusiveAmount: number,
    gstRate: number,
    country: CountryCode = "AU"
): { baseAmount: number; taxAmount: number } {
    const taxAmount = inclusiveAmount - (inclusiveAmount / (1 + gstRate / 100))
    return {
        baseAmount: inclusiveAmount - taxAmount,
        taxAmount: Math.round(taxAmount * 100) / 100,
    }
}

// ============================================
// Default Tax Rates
// ============================================

export const DEFAULT_TAX_RATES = {
    AU: [
        { name: "GST 10%", code: "AU_GST", rate: 10, taxType: "gst" },
        { name: "GST Free", code: "AU_GST_FREE", rate: 0, taxType: "exempt" },
    ],
    IN: [
        { name: "GST 5%", code: "IN_GST_5", rate: 5, taxType: "gst" },
        { name: "GST 12%", code: "IN_GST_12", rate: 12, taxType: "gst" },
        { name: "GST 18%", code: "IN_GST_18", rate: 18, taxType: "gst" },
        { name: "GST 28%", code: "IN_GST_28", rate: 28, taxType: "gst" },
        { name: "Exempt", code: "IN_EXEMPT", rate: 0, taxType: "exempt" },
    ],
}
