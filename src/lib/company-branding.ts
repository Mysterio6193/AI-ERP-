export interface CompanyBranding {
  id?: string | null
  name?: string | null
  tradingName?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  logoUrl?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  postcode?: string | null
  abn?: string | null
  acn?: string | null
  gstin?: string | null
  pan?: string | null
  tanNumber?: string | null
  cinNumber?: string | null
  bankName?: string | null
  bsb?: string | null
  accountNumber?: string | null
  accountName?: string | null
  ifscCode?: string | null
  upiId?: string | null
  gstRegistered?: boolean | null
  gstRate?: number | null
  abnOnInvoices?: boolean | null
  fiscalYearStart?: number | null
  defaultTerms?: string | null
  invoiceFooter?: string | null
  baseCurrency?: string | null
  country?: string | null
  setupComplete?: boolean | null
  onboardingStep?: number | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}

function isPlaceholderValue(value?: string | null) {
  return Boolean(value && /supply\s?sure|supplysure/i.test(value))
}

export function isPlaceholderBranding(company?: CompanyBranding | null) {
  if (!company || company.setupComplete === true) {
    return false
  }
  if (company.abn && company.abn.trim().length > 5) {
    return false
  }
  return isPlaceholderValue(company?.tradingName) && isPlaceholderValue(company?.name)
}

export function sanitizeCompanyBranding<T extends CompanyBranding | null | undefined>(company: T): T {
  if (!company || !isPlaceholderBranding(company)) {
    return company
  }

  return {
    ...company,
    name: null,
    tradingName: null,
    email: null,
    phone: null,
    website: null,
    logoUrl: null,
    address: null,
    city: null,
    state: null,
    postcode: null,
    abn: null,
    acn: null,
    gstin: null,
    pan: null,
    tanNumber: null,
    cinNumber: null,
    bankName: null,
    bsb: null,
    accountNumber: null,
    accountName: null,
    ifscCode: null,
    upiId: null,
    defaultTerms: null,
    invoiceFooter: null,
  } as T
}

export function getCompanyDisplayName(company?: CompanyBranding | null) {
  const sanitizedCompany = sanitizeCompanyBranding(company)
  const tradingName = sanitizedCompany?.tradingName
  const companyName = sanitizedCompany?.name

  return tradingName || companyName || "Your Company"
}

export function getCompanyAddressLine(company?: CompanyBranding | null) {
  const sanitizedCompany = sanitizeCompanyBranding(company)
  const lineParts = [sanitizedCompany?.city, sanitizedCompany?.state, sanitizedCompany?.postcode].filter(Boolean)
  return lineParts.join(", ")
}

export function getCompanyEmail(company?: CompanyBranding | null) {
  const sanitizedCompany = sanitizeCompanyBranding(company)
  return sanitizedCompany?.email || null
}

export function getCompanyWebsite(company?: CompanyBranding | null) {
  const sanitizedCompany = sanitizeCompanyBranding(company)
  return sanitizedCompany?.website || null
}

export function getDocumentLabel(documentType: "invoice" | "order" | "statement" | "purchase_order") {
  if (documentType === "invoice") return "Invoice"
  if (documentType === "statement") return "Statement"
  if (documentType === "purchase_order") return "Purchase Order"
  return "Sales Order"
}

export function buildDocumentEmailSubject(
  company: CompanyBranding | null | undefined,
  documentType: "invoice" | "order" | "statement" | "purchase_order",
  documentNumber: string
) {
  return `${getCompanyDisplayName(company)} ${getDocumentLabel(documentType)} ${documentNumber}`
}

export function buildDocumentEmailMessage(
  company: CompanyBranding | null | undefined,
  documentType: "invoice" | "order" | "statement" | "purchase_order",
  documentNumber: string
) {
  const sanitizedCompany = sanitizeCompanyBranding(company)
  const companyName = getCompanyDisplayName(company)
  const label = getDocumentLabel(documentType).toLowerCase()

  return [
    `Hi,`,
    ``,
    `Please find your ${label} ${documentNumber} from ${companyName} attached.`,
    ``,
    sanitizedCompany?.phone ? `If you have any questions, you can reach us on ${sanitizedCompany.phone}.` : `If you have any questions, just reply to this message.`,
    ``,
    `Regards,`,
    companyName,
  ].join("\n")
}
