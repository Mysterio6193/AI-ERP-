import { NextRequest, NextResponse } from "next/server"

import { getActiveCompany } from "@/lib/active-company"
import { requireAdminUser } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { ROLE_SETS } from "@/lib/permissions"

export type SearchResultKind =
  | "customer"
  | "order"
  | "product"
  | "invoice"
  | "supplier"
  | "purchase-order"

export interface SearchResultItem {
  kind: SearchResultKind
  label: string
  sub: string
  href: string
}

/**
 * Unified global search API.
 * Searches customers, orders, products, invoices, suppliers, and purchase orders.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ROLE_SETS.staff)
  if (auth.response) return auth.response

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  if (q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const company = await getActiveCompany(request)
  const companyId = company?.id
  const companyFilter = companyId ? { companyId } : {}

  const [customers, orders, products, invoices, suppliers, purchaseOrders] = await Promise.all([
    db.customer.findMany({
      where: {
        ...companyFilter,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    }),
    db.salesOrder.findMany({
      where: {
        ...companyFilter,
        orderNumber: { contains: q, mode: "insensitive" },
      },
      take: 5,
      select: {
        id: true,
        orderNumber: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.product.findMany({
      where: {
        ...companyFilter,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: {
        id: true,
        name: true,
        sku: true,
      },
      orderBy: { name: "asc" },
    }),
    db.invoice.findMany({
      where: {
        ...companyFilter,
        invoiceNumber: { contains: q, mode: "insensitive" },
      },
      take: 5,
      select: {
        id: true,
        invoiceNumber: true,
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.supplier.findMany({
      where: {
        ...companyFilter,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: { name: "asc" },
    }),
    db.purchaseOrder.findMany({
      where: {
        ...companyFilter,
        poNumber: { contains: q, mode: "insensitive" },
      },
      take: 5,
      select: {
        id: true,
        poNumber: true,
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  const results: SearchResultItem[] = [
    ...customers.map((c) => ({
      kind: "customer" as const,
      label: c.name,
      sub: c.email ?? "",
      href: `/customers/${c.id}`,
    })),
    ...orders.map((o) => ({
      kind: "order" as const,
      label: o.orderNumber,
      sub: o.customer?.name ?? "",
      href: `/orders/${o.id}`,
    })),
    ...products.map((p) => ({
      kind: "product" as const,
      label: p.name,
      sub: p.sku ?? "",
      href: `/products/${p.id}`,
    })),
    ...invoices.map((inv) => ({
      kind: "invoice" as const,
      label: inv.invoiceNumber,
      sub: inv.customer?.name ?? "",
      href: `/invoices/${inv.id}`,
    })),
    ...suppliers.map((s) => ({
      kind: "supplier" as const,
      label: s.name,
      sub: s.email ?? "",
      href: `/suppliers/${s.id}`,
    })),
    ...purchaseOrders.map((po) => ({
      kind: "purchase-order" as const,
      label: po.poNumber,
      sub: po.supplier?.name ?? "",
      href: `/purchase-orders/${po.id}`,
    })),
  ]

  return NextResponse.json({ results })
}
