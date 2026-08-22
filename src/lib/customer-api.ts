import { NextResponse } from "next/server"
import { getCustomerOrderingStatus } from "@/lib/customer-access"

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "http://localhost:3002",
  "http://127.0.0.1:3002",
  "http://localhost:8081",
  "http://127.0.0.1:8081",
]

function resolveOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin")
  const configuredOrigins = [
    process.env.CUSTOMER_WEB_ORIGIN,
    process.env.CUSTOMER_APP_ORIGIN,
  ].filter(Boolean) as string[]
  const allowlist = new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins])

  if (requestOrigin && allowlist.has(requestOrigin)) {
    return requestOrigin
  }

  return DEFAULT_ALLOWED_ORIGINS[0]
}

export function withCors(request: Request, response: NextResponse) {
  const requestedHeaders = request.headers.get("access-control-request-headers")
  const allowedHeaders = new Set(
    ["Content-Type", "Authorization", "X-Client-Channel"].map((header) => header.toLowerCase())
  )

  if (requestedHeaders) {
    requestedHeaders
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter(Boolean)
      .forEach((header) => allowedHeaders.add(header))
  }

  response.headers.set("Access-Control-Allow-Origin", resolveOrigin(request))
  response.headers.set("Access-Control-Allow-Credentials", "true")
  response.headers.set(
    "Access-Control-Allow-Headers",
    Array.from(allowedHeaders)
      .map((header) => header
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("-"))
      .join(", ")
  )
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
  response.headers.set("Vary", "Origin")
  return response
}

export function customerJson(
  request: Request,
  payload: unknown,
  init?: { status?: number }
) {
  return withCors(request, NextResponse.json(payload, init))
}

export function customerError(
  request: Request,
  message: string,
  status = 400,
  extra?: Record<string, unknown>
) {
  return customerJson(request, { success: false, message, ...extra }, { status })
}

export function customerOptions(request: Request) {
  return withCors(request, new NextResponse(null, { status: 204 }))
}

export function resolveCustomerAssetUrl(assetUrl: string | null | undefined, assetBaseUrl?: string) {
  if (!assetUrl) return null
  if (/^https?:\/\//i.test(assetUrl)) return assetUrl
  if (!assetBaseUrl) return assetUrl
  return new URL(assetUrl, assetBaseUrl).toString()
}

function totalInventoryQuantity(product: {
  inventory?: Array<{ quantity: number }>
}) {
  return (product.inventory || []).reduce((sum, item) => sum + item.quantity, 0)
}

export function mapCategory(category: {
  id: string
  name: string
  children?: Array<{ id: string; name: string }>
}) {
  return {
    id: category.id,
    name: category.name,
    image_url: null,
    subcategories: (category.children || []).map((child) => ({
      id: child.id,
      name: child.name,
    })),
  }
}

export function mapProductSummary(
  product: {
    id: string
    name: string
    description: string | null
    wholesalePrice: number
    imageUrl: string | null
    packUnit: string | null
    baseUnit: string
    category?: { name: string } | null
    variants?: Array<{
      id: string
      name: string | null
      wholesalePrice: number | null
    }>
    inventory?: Array<{ quantity: number }>
  },
  cartByVariantId?: Map<string, number>,
  assetBaseUrl?: string
) {
  const totalStock = totalInventoryQuantity(product)
  const baseVariantId = `base:${product.id}`
  const variants =
    product.variants && product.variants.length > 0
      ? product.variants.map((variant) => ({
          id: variant.id,
          unit: variant.name || product.packUnit || product.baseUnit,
          unit_value: variant.wholesalePrice ?? product.wholesalePrice,
          available_inventory_quantity: totalStock,
          cart_quantity: cartByVariantId?.get(variant.id) || 0,
          wishlisted: false,
        }))
      : [
          {
            id: baseVariantId,
            unit: product.packUnit || product.baseUnit,
            unit_value: product.wholesalePrice,
            available_inventory_quantity: totalStock,
            cart_quantity: cartByVariantId?.get(baseVariantId) || 0,
            wishlisted: false,
          },
        ]

  return {
    id: product.id,
    name: product.name,
    category: product.category?.name || "Uncategorized",
    base_price: product.wholesalePrice,
    description: product.description || "",
    image_url: resolveCustomerAssetUrl(product.imageUrl, assetBaseUrl),
    in_stock: totalStock > 0,
    variant: variants,
  }
}

export function mapProductDetail(
  product: Parameters<typeof mapProductSummary>[0],
  cartByVariantId?: Map<string, number>,
  assetBaseUrl?: string
) {
  const summary = mapProductSummary(product, cartByVariantId, assetBaseUrl)
  return {
    id: summary.id,
    name: summary.name,
    description: summary.description,
    base_price: summary.base_price,
    category: summary.category,
    images: product.imageUrl ? [resolveCustomerAssetUrl(product.imageUrl, assetBaseUrl)] : [],
    variant: summary.variant,
  }
}

export function mapProfile(customer: {
  id: string
  name: string
  contactPerson: string | null
  email: string | null
  phone: string | null
  creditLimit?: number
  creditBalance?: number
  creditStatus?: string | null
  status?: string | null
  customerType?: string | null
  wishlists?: Array<{ id: string }>
  locations?: Array<{
    id: string
    label: string
    address: string
    address2: string | null
    city: string
    postcode: string
    state: string
    isDefault: boolean
  }>
  cartItems?: Array<{ quantity: number }>
}) {
  const defaultLocation =
    customer.locations?.find((location) => location.isDefault) || customer.locations?.[0]
  const ordering = getCustomerOrderingStatus(customer)

  return {
    id: customer.id,
    full_name: customer.contactPerson || customer.name,
    email: customer.email || "",
    phone_no: customer.phone || "",
    role: "customer",
    user_type: customer.customerType || "retail",
    credit_limit: customer.creditLimit || 0,
    credit_balance: customer.creditBalance || 0,
    credit_status: customer.creditStatus || "active",
    status: customer.status || "active",
    ordering_enabled: ordering.orderingEnabled,
    ordering_message: ordering.orderingMessage,
    cart_count: (customer.cartItems || []).reduce((sum, item) => sum + item.quantity, 0),
    wishlist_count: customer.wishlists?.length || 0,
    address: defaultLocation ? mapAddress(defaultLocation) : null,
  }
}

export function mapAddress(location: {
  id: string
  label: string
  address: string
  address2: string | null
  city: string
  postcode: string
  state: string
  isDefault: boolean
}) {
  return {
    id: location.id,
    address_label: location.label,
    address_line_1: location.address,
    address_line_2: location.address2,
    city: location.city,
    state: location.state,
    pincode: location.postcode,
    is_default: location.isDefault,
  }
}

export function mapOrder(order: {
  id: string
  orderDate: Date
  totalAmount: number
  status: string
  items: Array<{ quantity: number; product?: { name: string } | null }>
  invoice?: { id: string; invoiceNumber: string } | null
}) {
  return {
    id: order.id,
    order_date: order.orderDate,
    total_amount: order.totalAmount,
    status: order.status,
    item_count: order.items.reduce((sum, item) => sum + item.quantity, 0),
    items: order.items.map((item) => item.product?.name || "Item"),
    invoice_url: order.invoice ? `/profile/invoices?invoice=${order.invoice.id}` : null,
  }
}

export function mapCartItem(item: {
  quantity: number
  product: {
    id: string
    name: string
    description: string | null
    imageUrl: string | null
    wholesalePrice: number
    packUnit: string | null
    baseUnit: string
    category?: { name: string } | null
    inventory?: Array<{ quantity: number }>
  }
  variant?: {
    id: string
    name: string | null
    wholesalePrice: number | null
  } | null
}, assetBaseUrl?: string) {
  const totalStock = totalInventoryQuantity(item.product)
  const unitValue = item.variant?.wholesalePrice ?? item.product.wholesalePrice
  return {
    product: {
      id: item.product.id,
      name: item.product.name,
      description: item.product.description || "",
      image_url: resolveCustomerAssetUrl(item.product.imageUrl, assetBaseUrl),
      category: item.product.category?.name || "Uncategorized",
    },
    product_variant: {
      id: item.variant?.id || `base:${item.product.id}`,
      unit: item.variant?.name || item.product.packUnit || item.product.baseUnit,
      unit_value: unitValue,
      available_inventory_quantity: totalStock,
      cart_quantity: item.quantity,
      wishlisted: false,
    },
    cart_quantity: item.quantity,
    price: unitValue,
  }
}
