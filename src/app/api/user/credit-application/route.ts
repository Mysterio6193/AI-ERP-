import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

const prisma = db as any

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const body = await request.json()
    const formData = body.form_data || {}
    const applicant = formData.applicant_details || {}
    const creditRequirement = formData.credit_requirement || {}

    const requestedLimit = Number(creditRequirement.credit_limit_requested || 0)
    const averageMonthlySpend = Number(creditRequirement.average_monthly_spend || 0)

    if (!applicant.registered_business_name?.trim()) {
      return customerError(request, "Registered business name is required.", 400)
    }

    if (!requestedLimit || requestedLimit <= 0) {
      return customerError(request, "Credit limit requested must be greater than 0.", 400)
    }

    const existingPending = await prisma.creditApplication.findFirst({
      where: {
        customerId: customer.id,
        status: { in: ["submitted", "under_review"] },
      },
      orderBy: { createdAt: "desc" },
    })

    if (existingPending) {
      return customerError(
        request,
        "You already have a pending credit application under review.",
        400,
        { data: existingPending }
      )
    }

    const application = await prisma.creditApplication.create({
      data: {
        customerId: customer.id,
        businessName: applicant.registered_business_name.trim(),
        tradingName: applicant.trading_name?.trim() || null,
        abnOrAcn: applicant.abn_acn?.trim() || null,
        businessStructure: applicant.business_structure?.trim() || null,
        accountsContact: applicant.accounts_contact?.trim() || null,
        accountsEmail: applicant.accounts_email?.trim() || null,
        contactEmail: applicant.email?.trim() || customer.email || null,
        contactPhone: applicant.phone?.trim() || customer.phone || null,
        requestedLimit,
        averageMonthlySpend: Number.isFinite(averageMonthlySpend) ? averageMonthlySpend : 0,
        consentAccepted: Boolean(body.consent_accepted),
        consentName: body.consent_name?.trim() || null,
        termsVersion: body.terms_version?.trim() || null,
        payloadJson: JSON.stringify(body),
      },
    })

    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        name: applicant.registered_business_name.trim() || customer.name,
        tradingName: applicant.trading_name?.trim() || customer.tradingName || null,
        abn: applicant.abn_acn?.trim() || customer.abn || null,
        contactPerson: applicant.accounts_contact?.trim() || customer.contactPerson || customer.name,
        phone: applicant.phone?.trim() || customer.phone,
        email: applicant.email?.trim() || customer.email,
      },
    })

    return customerJson(request, {
      success: true,
      message: "Credit application submitted successfully.",
      data: application,
    })
  } catch (error) {
    console.error("Customer credit application error:", error)
    return customerError(request, "Failed to submit credit application.", 500)
  }
}
