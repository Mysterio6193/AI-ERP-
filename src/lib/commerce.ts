export const COMMERCE_CHANNELS = [
  { value: "admin", label: "Admin", color: "bg-slate-100 text-slate-700" },
  { value: "customer_web", label: "Website", color: "bg-blue-100 text-blue-700" },
  { value: "customer_app", label: "Mobile App", color: "bg-emerald-100 text-emerald-700" },
] as const

export type CommerceChannel = (typeof COMMERCE_CHANNELS)[number]["value"]

export const COMMERCE_CHANNEL_LABELS: Record<CommerceChannel, string> = {
  admin: "Admin",
  customer_web: "Website",
  customer_app: "Mobile App",
}

export const COMMERCE_CHANNEL_COLORS: Record<CommerceChannel, string> = {
  admin: "bg-slate-100 text-slate-700",
  customer_web: "bg-blue-100 text-blue-700",
  customer_app: "bg-emerald-100 text-emerald-700",
}

export function normalizeCommerceChannel(value?: string | null): CommerceChannel {
  if (value === "customer_app") return "customer_app"
  if (value === "customer_web") return "customer_web"
  return "admin"
}

export function isCustomerChannel(value?: string | null) {
  return normalizeCommerceChannel(value) !== "admin"
}

export function getCommerceChannelFromRequest(request: Request): CommerceChannel {
  const headerValue = request.headers.get("x-client-channel")
  return normalizeCommerceChannel(headerValue)
}

export interface CommerceSettingsShape {
  id?: string
  companyId?: string | null
  websiteEnabled: boolean
  mobileAppEnabled: boolean
  maintenanceMode: boolean
  autoApproveOrders: boolean
  inventorySyncEnabled: boolean
  showOutOfStock: boolean
  websiteUrl: string | null
  appStoreUrl: string | null
  playStoreUrl: string | null
  supportEmail: string | null
  supportPhone: string | null
  announcementEnabled: boolean
  announcementText: string | null
  heroTitle: string | null
  heroSubtitle: string | null
  primaryCtaLabel: string | null
  primaryCtaHref: string | null
  featuredCategoryIds: string | null
  guestCheckoutEnabled: boolean
  minimumOrderAmount: number
  freeDeliveryThreshold: number
  supportHours: string | null
  estimatedDeliveryWindow: string | null
  returnsPolicySummary: string | null
  seoTitle: string | null
  seoDescription: string | null
}

export const DEFAULT_COMMERCE_SETTINGS: CommerceSettingsShape = {
  websiteEnabled: true,
  mobileAppEnabled: true,
  maintenanceMode: false,
  autoApproveOrders: true,
  inventorySyncEnabled: true,
  showOutOfStock: true,
  websiteUrl: null,
  appStoreUrl: null,
  playStoreUrl: null,
  supportEmail: null,
  supportPhone: null,
  announcementEnabled: false,
  announcementText: null,
  heroTitle: "Order faster across web and mobile",
  heroSubtitle: "Manage your customer commerce experience from one operating system.",
  primaryCtaLabel: "Shop now",
  primaryCtaHref: "/products",
  featuredCategoryIds: null,
  guestCheckoutEnabled: false,
  minimumOrderAmount: 0,
  freeDeliveryThreshold: 0,
  supportHours: "Mon-Fri, 8am-6pm",
  estimatedDeliveryWindow: "Same-day metro delivery for approved accounts.",
  returnsPolicySummary: "Contact support within 24 hours for damaged or incorrect items.",
  seoTitle: "Order wholesale groceries and hospitality supplies",
  seoDescription: "Jumbo Foods customer ordering across web and mobile, backed by SupplySure OS.",
}

export function normalizeCommerceSettings(
  input?: Partial<CommerceSettingsShape> | null
): CommerceSettingsShape {
  const minimumOrderAmount = Number(input?.minimumOrderAmount)
  const freeDeliveryThreshold = Number(input?.freeDeliveryThreshold)

  return {
    ...DEFAULT_COMMERCE_SETTINGS,
    ...input,
    websiteUrl: input?.websiteUrl?.trim() || null,
    appStoreUrl: input?.appStoreUrl?.trim() || null,
    playStoreUrl: input?.playStoreUrl?.trim() || null,
    supportEmail: input?.supportEmail?.trim() || null,
    supportPhone: input?.supportPhone?.trim() || null,
    announcementText: input?.announcementText?.trim() || null,
    heroTitle: input?.heroTitle?.trim() || DEFAULT_COMMERCE_SETTINGS.heroTitle,
    heroSubtitle: input?.heroSubtitle?.trim() || DEFAULT_COMMERCE_SETTINGS.heroSubtitle,
    primaryCtaLabel: input?.primaryCtaLabel?.trim() || DEFAULT_COMMERCE_SETTINGS.primaryCtaLabel,
    primaryCtaHref: input?.primaryCtaHref?.trim() || DEFAULT_COMMERCE_SETTINGS.primaryCtaHref,
    featuredCategoryIds: input?.featuredCategoryIds?.trim() || null,
    minimumOrderAmount: Number.isFinite(minimumOrderAmount) ? minimumOrderAmount : DEFAULT_COMMERCE_SETTINGS.minimumOrderAmount,
    freeDeliveryThreshold: Number.isFinite(freeDeliveryThreshold) ? freeDeliveryThreshold : DEFAULT_COMMERCE_SETTINGS.freeDeliveryThreshold,
    supportHours: input?.supportHours?.trim() || DEFAULT_COMMERCE_SETTINGS.supportHours,
    estimatedDeliveryWindow: input?.estimatedDeliveryWindow?.trim() || DEFAULT_COMMERCE_SETTINGS.estimatedDeliveryWindow,
    returnsPolicySummary: input?.returnsPolicySummary?.trim() || DEFAULT_COMMERCE_SETTINGS.returnsPolicySummary,
    seoTitle: input?.seoTitle?.trim() || DEFAULT_COMMERCE_SETTINGS.seoTitle,
    seoDescription: input?.seoDescription?.trim() || DEFAULT_COMMERCE_SETTINGS.seoDescription,
  }
}
