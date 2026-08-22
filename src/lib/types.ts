// SupplySure OS - Multi-Country B2B Distribution System Types

// ============================================
// Country Support
// ============================================

export const COUNTRY_OPTIONS = [
  { value: "AU", label: "Australia", currency: "AUD", currencySymbol: "$", locale: "en-AU" },
  { value: "IN", label: "India", currency: "INR", currencySymbol: "₹", locale: "en-IN" },
] as const

export type CountryCode = (typeof COUNTRY_OPTIONS)[number]["value"]

export const CURRENCY_MAP: Record<CountryCode, { code: string; symbol: string; locale: string }> = {
  AU: { code: "AUD", symbol: "$", locale: "en-AU" },
  IN: { code: "INR", symbol: "₹", locale: "en-IN" },
}

// ============================================
// Australian States & Territories
// ============================================

export const AUSTRALIAN_STATES = [
  "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT",
] as const

export type AustralianState = (typeof AUSTRALIAN_STATES)[number]

export const STATE_NAMES: Record<AustralianState, string> = {
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
}

// ============================================
// Indian States & Union Territories
// ============================================

export const INDIAN_STATES = [
  "AN", "AP", "AR", "AS", "BR", "CG", "CH", "DD", "DL", "GA",
  "GJ", "HP", "HR", "JH", "JK", "KA", "KL", "LA", "LD", "MH",
  "ML", "MN", "MP", "MZ", "NL", "OD", "PB", "PY", "RJ", "SK",
  "TG", "TN", "TR", "UK", "UP", "WB",
] as const

export type IndianState = (typeof INDIAN_STATES)[number]

export const INDIAN_STATE_NAMES: Record<IndianState, string> = {
  AN: "Andaman & Nicobar", AP: "Andhra Pradesh", AR: "Arunachal Pradesh",
  AS: "Assam", BR: "Bihar", CG: "Chhattisgarh", CH: "Chandigarh",
  DD: "Dadra & Nagar Haveli and Daman & Diu", DL: "Delhi", GA: "Goa",
  GJ: "Gujarat", HP: "Himachal Pradesh", HR: "Haryana",
  JH: "Jharkhand", JK: "Jammu & Kashmir", KA: "Karnataka",
  KL: "Kerala", LA: "Ladakh", LD: "Lakshadweep",
  MH: "Maharashtra", ML: "Meghalaya", MN: "Manipur",
  MP: "Madhya Pradesh", MZ: "Mizoram", NL: "Nagaland",
  OD: "Odisha", PB: "Punjab", PY: "Puducherry",
  RJ: "Rajasthan", SK: "Sikkim", TG: "Telangana",
  TN: "Tamil Nadu", TR: "Tripura", UK: "Uttarakhand",
  UP: "Uttar Pradesh", WB: "West Bengal",
}

// Combined state getter
export function getStatesForCountry(country: CountryCode) {
  if (country === "IN") {
    return INDIAN_STATES.map(s => ({ value: s, label: INDIAN_STATE_NAMES[s] }))
  }
  return AUSTRALIAN_STATES.map(s => ({ value: s, label: STATE_NAMES[s] }))
}

// ============================================
// Tax ID Labels by Country
// ============================================

export const TAX_ID_LABELS: Record<CountryCode, { primary: string; secondary: string }> = {
  AU: { primary: "ABN (Australian Business Number)", secondary: "ACN (Australian Company Number)" },
  IN: { primary: "GSTIN (GST Identification Number)", secondary: "PAN (Permanent Account Number)" },
}

// ============================================
// User Roles
// ============================================

export const USER_ROLES = [
  "admin", "sales", "warehouse", "accounts", "driver", "agent",
] as const

export type UserRole = (typeof USER_ROLES)[number]

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  sales: "Sales Representative",
  warehouse: "Warehouse Staff",
  accounts: "Accounts & Finance",
  driver: "Delivery Driver",
  agent: "AI Agent",
}

// ============================================
// Product Types
// ============================================

export const UNITS_OF_MEASURE = [
  { value: "each", label: "Each" },
  { value: "carton", label: "Carton" },
  { value: "box", label: "Box" },
  { value: "pack", label: "Pack" },
  { value: "kg", label: "Kilogram" },
  { value: "litre", label: "Litre" },
  { value: "metre", label: "Metre" },
  { value: "roll", label: "Roll" },
  { value: "bag", label: "Bag" },
  { value: "bottle", label: "Bottle" },
  { value: "can", label: "Can" },
  { value: "pallet", label: "Pallet" },
] as const

export type UnitOfMeasure = (typeof UNITS_OF_MEASURE)[number]["value"]

export const PRODUCT_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "discontinued", label: "Discontinued" },
] as const

export type ProductStatus = (typeof PRODUCT_STATUS_OPTIONS)[number]["value"]

// ============================================
// GST & Tax (Multi-Country)
// ============================================

// Australian GST
export const AU_GST_RATE = 10.0

export const AU_GST_OPTIONS = [
  { value: 10, label: "GST Included (10%)" },
  { value: 0, label: "GST Free" },
  { value: 0, label: "Input Taxed" },
] as const

// Indian GST (standard rates)
export const IN_GST_RATES = [
  { value: 0, label: "Exempt (0%)" },
  { value: 5, label: "GST 5% (CGST 2.5% + SGST 2.5%)" },
  { value: 12, label: "GST 12% (CGST 6% + SGST 6%)" },
  { value: 18, label: "GST 18% (CGST 9% + SGST 9%)" },
  { value: 28, label: "GST 28% (CGST 14% + SGST 14%)" },
] as const

// Legacy compatibility
export const GST_RATE = 10.0
export const GST_OPTIONS = AU_GST_OPTIONS

export function getGSTOptionsForCountry(country: CountryCode) {
  return country === "IN" ? IN_GST_RATES : AU_GST_OPTIONS
}

// ============================================
// Customer Types
// ============================================

export const CUSTOMER_TYPES = [
  { value: "wholesale", label: "Wholesale" },
  { value: "retail", label: "Retail" },
  { value: "business", label: "Business" },
  { value: "government", label: "Government" },
] as const

export type CustomerType = (typeof CUSTOMER_TYPES)[number]["value"]

export const CUSTOMER_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "inactive", label: "Inactive" },
  { value: "blocked", label: "Blocked" },
] as const

export type CustomerStatus = (typeof CUSTOMER_STATUS_OPTIONS)[number]["value"]

export const CREDIT_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "stopped", label: "Stopped" },
] as const

export type CreditStatus = (typeof CREDIT_STATUS_OPTIONS)[number]["value"]

// ============================================
// Credit Transaction Types
// ============================================

export const CREDIT_TRANSACTION_TYPES = [
  { value: "credit_grant", label: "Credit Granted", color: "bg-green-100 text-green-700" },
  { value: "invoice_charge", label: "Invoice Charge", color: "bg-red-100 text-red-700" },
  { value: "payment_received", label: "Payment Received", color: "bg-blue-100 text-blue-700" },
  { value: "adjustment", label: "Adjustment", color: "bg-yellow-100 text-yellow-700" },
  { value: "refund", label: "Refund", color: "bg-purple-100 text-purple-700" },
] as const

export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number]["value"]

// ============================================
// Payment Terms
// ============================================

export const PAYMENT_TERMS_OPTIONS = [
  { value: 7, label: "Net 7" },
  { value: 14, label: "Net 14" },
  { value: 30, label: "Net 30" },
  { value: 45, label: "Net 45" },
  { value: 60, label: "Net 60" },
  { value: 90, label: "Net 90" },
  { value: 0, label: "COD (Cash on Delivery)" },
  { value: -1, label: "EOM (End of Month)" },
] as const

// ============================================
// Sales Order Status
// ============================================

export const SALES_ORDER_STATUS = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "pending_approval", label: "Pending Approval", color: "bg-yellow-100 text-yellow-700" },
  { value: "approved", label: "Approved", color: "bg-blue-100 text-blue-700" },
  { value: "picking", label: "Picking", color: "bg-orange-100 text-orange-700" },
  { value: "packed", label: "Packed", color: "bg-purple-100 text-purple-700" },
  { value: "dispatched", label: "Dispatched", color: "bg-indigo-100 text-indigo-700" },
  { value: "delivered", label: "Delivered", color: "bg-green-100 text-green-700" },
  { value: "invoiced", label: "Invoiced", color: "bg-teal-100 text-teal-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700" },
] as const

export type SalesOrderStatus = (typeof SALES_ORDER_STATUS)[number]["value"]

export const SALES_ORDER_STATUS_COLORS: Record<SalesOrderStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_approval: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  picking: "bg-orange-100 text-orange-700",
  packed: "bg-purple-100 text-purple-700",
  dispatched: "bg-indigo-100 text-indigo-700",
  delivered: "bg-green-100 text-green-700",
  invoiced: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-700",
}

// ============================================
// Quote Status
// ============================================

export const QUOTE_STATUS = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-700" },
  { value: "accepted", label: "Accepted", color: "bg-green-100 text-green-700" },
  { value: "rejected", label: "Rejected", color: "bg-red-100 text-red-700" },
  { value: "expired", label: "Expired", color: "bg-orange-100 text-orange-700" },
  { value: "converted", label: "Converted to Order", color: "bg-teal-100 text-teal-700" },
] as const

export type QuoteStatus = (typeof QUOTE_STATUS)[number]["value"]

export const QUOTE_STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  expired: "bg-orange-100 text-orange-700",
  converted: "bg-teal-100 text-teal-700",
}

// ============================================
// Purchase Order Status
// ============================================

export const PURCHASE_ORDER_STATUS = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "submitted", label: "Submitted", color: "bg-blue-100 text-blue-700" },
  { value: "confirmed", label: "Confirmed", color: "bg-indigo-100 text-indigo-700" },
  { value: "partial", label: "Partially Received", color: "bg-orange-100 text-orange-700" },
  { value: "received", label: "Fully Received", color: "bg-green-100 text-green-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-red-100 text-red-700" },
] as const

export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUS)[number]["value"]

// ============================================
// Invoice Status
// ============================================

export const INVOICE_STATUS = [
  { value: "draft", label: "Draft", color: "bg-gray-100 text-gray-700" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-700" },
  { value: "unpaid", label: "Unpaid", color: "bg-orange-100 text-orange-700" },
  { value: "partial", label: "Partially Paid", color: "bg-yellow-100 text-yellow-700" },
  { value: "paid", label: "Paid", color: "bg-green-100 text-green-700" },
  { value: "overdue", label: "Overdue", color: "bg-red-100 text-red-700" },
  { value: "cancelled", label: "Cancelled", color: "bg-gray-100 text-gray-500" },
] as const

export type InvoiceStatus = (typeof INVOICE_STATUS)[number]["value"]

// ============================================
// Payment Methods (Multi-Country)
// ============================================

export const AU_PAYMENT_METHODS = [
  { value: "bank_transfer", label: "Bank Transfer (EFT)" },
  { value: "bpay", label: "BPAY" },
  { value: "credit_card", label: "Credit Card" },
  { value: "eftpos", label: "EFTPOS" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
] as const

export const IN_PAYMENT_METHODS = [
  { value: "upi", label: "UPI" },
  { value: "neft", label: "NEFT" },
  { value: "rtgs", label: "RTGS" },
  { value: "imps", label: "IMPS" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "credit_card", label: "Credit Card" },
  { value: "debit_card", label: "Debit Card" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
] as const

// Legacy compatibility
export const PAYMENT_METHODS = AU_PAYMENT_METHODS

export function getPaymentMethodsForCountry(country: CountryCode) {
  return country === "IN" ? IN_PAYMENT_METHODS : AU_PAYMENT_METHODS
}

export type PaymentMethod = string

// ============================================
// Delivery Status
// ============================================

export const DELIVERY_STATUS = [
  { value: "pending", label: "Pending", color: "bg-gray-100 text-gray-700" },
  { value: "in_transit", label: "In Transit", color: "bg-blue-100 text-blue-700" },
  { value: "delivered", label: "Delivered", color: "bg-green-100 text-green-700" },
  { value: "failed", label: "Failed", color: "bg-red-100 text-red-700" },
  { value: "returned", label: "Returned", color: "bg-orange-100 text-orange-700" },
] as const

export type DeliveryStatus = (typeof DELIVERY_STATUS)[number]["value"]

// ============================================
// Stock Movement Types
// ============================================

export const STOCK_MOVEMENT_TYPES = [
  { value: "in", label: "Stock In" },
  { value: "out", label: "Stock Out" },
  { value: "transfer", label: "Transfer" },
  { value: "adjustment", label: "Adjustment" },
  { value: "reservation", label: "Reservation" },
  { value: "sale", label: "Sale" },
  { value: "purchase", label: "Purchase" },
] as const

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]["value"]

// ============================================
// Price List Types
// ============================================

export const PRICE_LIST_TYPES = [
  { value: "wholesale", label: "Wholesale" },
  { value: "retail", label: "Retail" },
  { value: "contract", label: "Contract Pricing" },
  { value: "promotional", label: "Promotional" },
] as const

export type PriceListType = (typeof PRICE_LIST_TYPES)[number]["value"]

// ============================================
// Expense Categories
// ============================================

export const EXPENSE_CATEGORIES = [
  { value: "rent", label: "Rent & Lease" },
  { value: "utilities", label: "Utilities" },
  { value: "salary", label: "Salary & Wages" },
  { value: "travel", label: "Travel & Transport" },
  { value: "supplies", label: "Office Supplies" },
  { value: "marketing", label: "Marketing & Advertising" },
  { value: "insurance", label: "Insurance" },
  { value: "repairs", label: "Repairs & Maintenance" },
  { value: "professional", label: "Professional Services" },
  { value: "telecom", label: "Telecom & Internet" },
  { value: "other", label: "Other" },
] as const

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"]

// ============================================
// Account Types (Chart of Accounts)
// ============================================

export const ACCOUNT_TYPES = [
  { value: "asset", label: "Asset", normalSide: "debit" },
  { value: "liability", label: "Liability", normalSide: "credit" },
  { value: "equity", label: "Equity", normalSide: "credit" },
  { value: "revenue", label: "Revenue", normalSide: "credit" },
  { value: "expense", label: "Expense", normalSide: "debit" },
] as const

export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"]

// ============================================
// Currency Formatting (Multi-Country)
// ============================================

export const CURRENCY = "AUD"
export const CURRENCY_SYMBOL = "$"

export const formatCurrency = (amount: number, country: CountryCode = "AU"): string => {
  const config = CURRENCY_MAP[country]
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export const formatCurrencyShort = (amount: number, country: CountryCode = "AU"): string => {
  const symbol = CURRENCY_MAP[country].symbol
  if (amount >= 10000000 && country === "IN") {
    return `${symbol}${(amount / 10000000).toFixed(1)}Cr`
  } else if (amount >= 100000 && country === "IN") {
    return `${symbol}${(amount / 100000).toFixed(1)}L`
  } else if (amount >= 1000000) {
    return `${symbol}${(amount / 1000000).toFixed(1)}M`
  } else if (amount >= 1000) {
    return `${symbol}${(amount / 1000).toFixed(1)}K`
  }
  return `${symbol}${amount.toFixed(0)}`
}

// ============================================
// Date Formatting
// ============================================

export const formatDate = (date: Date | string, country: CountryCode = "AU"): string => {
  const locale = CURRENCY_MAP[country].locale
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date))
}

export const formatDateTime = (date: Date | string, country: CountryCode = "AU"): string => {
  const locale = CURRENCY_MAP[country].locale
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

// ============================================
// ABN Validation (Australia)
// ============================================

export const validateABN = (abn: string): boolean => {
  const cleanAbn = abn.replace(/\s/g, "")
  if (!/^\d{11}$/.test(cleanAbn)) return false
  
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19]
  let sum = 0
  const digits = cleanAbn.split("").map(Number)
  digits[0] -= 1
  
  for (let i = 0; i < 11; i++) {
    sum += digits[i] * weights[i]
  }
  
  return sum % 89 === 0
}

export const formatABN = (abn: string): string => {
  const clean = abn.replace(/\s/g, "")
  return `${clean.slice(0, 2)} ${clean.slice(2, 5)} ${clean.slice(5, 8)} ${clean.slice(8, 11)}`
}

// ============================================
// GSTIN Validation (India)
// ============================================

export const validateGSTIN = (gstin: string): boolean => {
  const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
  return pattern.test(gstin.toUpperCase().replace(/\s/g, ""))
}

export const formatGSTIN = (gstin: string): string => {
  const clean = gstin.replace(/\s/g, "").toUpperCase()
  return `${clean.slice(0, 2)} ${clean.slice(2, 7)} ${clean.slice(7, 11)} ${clean.slice(11, 13)} ${clean.slice(13)}`
}

export const validatePAN = (pan: string): boolean => {
  const pattern = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/
  return pattern.test(pan.toUpperCase().replace(/\s/g, ""))
}

// ============================================
// Order Number Generation
// ============================================

export const generateOrderNumber = (prefix: string = "SO"): string => {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const random = String(Math.floor(Math.random() * 10000)).padStart(4, "0")
  return `${prefix}-${year}${month}-${random}`
}
