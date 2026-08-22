import { NextRequest } from "next/server"

import { customerError, customerJson, customerOptions } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"
import { db } from "@/lib/db"
import { getStripeClient, isStripeConfigured, resolveStripeReturnOrigin } from "@/lib/stripe"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    if (!isStripeConfigured()) {
      return customerError(request, "Stripe is not configured yet.", 400)
    }

    const { id } = await params
    const invoice = await db.invoice.findFirst({
      where: { id, customerId: customer.id },
    })

    if (!invoice) {
      return customerError(request, "Invoice not found.", 404)
    }

    if (invoice.outstandingAmt <= 0) {
      return customerError(request, "This invoice is already paid.", 400)
    }

    const stripe = getStripeClient()
    if (!stripe) {
      return customerError(request, "Stripe is not available.", 400)
    }

    const origin = resolveStripeReturnOrigin(request)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "aud",
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
            },
            unit_amount: Math.round(invoice.outstandingAmt * 100),
          },
        },
      ],
      metadata: {
        flow: "customer_invoice",
        invoiceId: invoice.id,
        customerId: customer.id,
      },
      success_url: `${origin}/profile/invoices?paid=${invoice.id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/profile/invoices?invoice=${invoice.id}`,
    })

    return customerJson(request, {
      success: true,
      message: "Payment link created successfully.",
      data: {
        checkout_url: session.url,
      },
    })
  } catch (error) {
    console.error("Customer invoice payment link error:", error)
    return customerError(request, "Failed to create invoice payment link.", 500)
  }
}
