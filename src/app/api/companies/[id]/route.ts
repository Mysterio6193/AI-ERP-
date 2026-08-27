import { NextRequest, NextResponse } from "next/server"

import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { canRaiseInvoices, validateCompany } from "@/lib/companies"
import { db } from "@/lib/db"

/** One entity: read it, correct it, or remove it if nothing depends on it. */

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUserFromRequest(request)
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const company = await db.company.findUnique({ where: { id } })

  if (!company) {
    return NextResponse.json({ success: false, error: "No such company" }, { status: 404 })
  }

  const billing = canRaiseInvoices(company)

  return NextResponse.json({
    success: true,
    data: { ...company, canRaiseInvoices: billing.ok, missingForInvoicing: billing.missing },
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUserFromRequest(request)
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  if (user.role !== "admin") {
    return NextResponse.json({ success: false, error: "Only an admin can edit a company." }, { status: 403 })
  }

  const { id } = await params
  const existing = await db.company.findUnique({ where: { id } })

  if (!existing) {
    return NextResponse.json({ success: false, error: "No such company" }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))

  // Merged over the existing record so a partial edit does not blank the fields
  // it left out — an invoice loses its ABN that way without anyone touching it.
  const verdict = validateCompany({ ...existing, ...body })

  if (!verdict.ok) {
    return NextResponse.json({ success: false, error: verdict.error, field: verdict.field }, { status: 400 })
  }

  if (verdict.company.abn && verdict.company.abn !== existing.abn) {
    const clash = await db.company.findUnique({ where: { abn: verdict.company.abn }, select: { id: true, name: true } })
    if (clash && clash.id !== id) {
      return NextResponse.json(
        { success: false, field: "abn", error: `That ABN already belongs to ${clash.name}.` },
        { status: 409 }
      )
    }
  }

  const company = await db.company.update({ where: { id }, data: verdict.company })
  const billing = canRaiseInvoices(company)

  return NextResponse.json({
    success: true,
    data: { ...company, canRaiseInvoices: billing.ok, missingForInvoicing: billing.missing },
  })
}

/**
 * Remove an entity, but only if nothing is attached to it.
 *
 * Thirty-one models carry `companyId`. Cascading would delete a company's
 * entire trading history on a misclick, so anything attached refuses the delete
 * and says what is in the way — which is also the more useful answer.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAdminUserFromRequest(request)
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })

  if (user.role !== "admin") {
    return NextResponse.json({ success: false, error: "Only an admin can remove a company." }, { status: 403 })
  }

  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { name: true } })

  if (!company) {
    return NextResponse.json({ success: false, error: "No such company" }, { status: 404 })
  }

  const [orders, invoices, customers, products, users] = await Promise.all([
    db.salesOrder.count({ where: { companyId: id } }),
    db.invoice.count({ where: { companyId: id } }),
    db.customer.count({ where: { companyId: id } }),
    db.product.count({ where: { companyId: id } }),
    db.user.count({ where: { companyId: id } }),
  ])

  const attached = [
    orders && `${orders} order${orders === 1 ? "" : "s"}`,
    invoices && `${invoices} invoice${invoices === 1 ? "" : "s"}`,
    customers && `${customers} customer${customers === 1 ? "" : "s"}`,
    products && `${products} product${products === 1 ? "" : "s"}`,
    users && `${users} user${users === 1 ? "" : "s"}`,
  ].filter(Boolean) as string[]

  if (attached.length > 0) {
    return NextResponse.json(
      {
        success: false,
        error: `${company.name} still has ${attached.join(", ")}. Move or remove those first — deleting the company would take its trading history with it.`,
      },
      { status: 409 }
    )
  }

  const remaining = await db.company.count()
  if (remaining <= 1) {
    // Without one, nothing can be invoiced and no page can scope itself.
    return NextResponse.json(
      { success: false, error: "This is the only company. At least one must exist." },
      { status: 409 }
    )
  }

  await db.company.delete({ where: { id } })

  return NextResponse.json({ success: true, data: { id, name: company.name } })
}
