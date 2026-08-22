import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions, mapAddress } from "@/lib/customer-api"
import { requireCustomer } from "@/lib/customer-auth"

function mapLabel(label?: string) {
  return label?.trim() || "Other"
}

async function clearDefaultAddresses(customerId: string) {
  await db.customerLocation.updateMany({
    where: { customerId },
    data: { isDefault: false },
  })
}

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
    if (!body.address_line_1?.trim() || !body.city?.trim() || !body.pincode?.trim()) {
      return customerError(request, "Address line, city, and pincode are required.", 400)
    }

    if (body.is_default) {
      await clearDefaultAddresses(customer.id)
    }

    const address = await db.customerLocation.create({
      data: {
        customerId: customer.id,
        label: mapLabel(body.address_label),
        address: body.address_line_1.trim(),
        address2: body.address_line_2?.trim() || null,
        city: body.city.trim(),
        state: body.state?.trim() || "",
        postcode: body.pincode.trim(),
        isShipping: true,
        isBilling: Boolean(body.is_billing),
        isDefault: Boolean(body.is_default),
      },
    })

    return customerJson(request, {
      success: true,
      message: "Address added successfully.",
      data: mapAddress(address),
    })
  } catch (error) {
    console.error("Customer create address error:", error)
    return customerError(request, "Failed to add address.", 500)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const customer = await requireCustomer(request)
    if (!customer) {
      return customerError(request, "Unauthorized.", 401)
    }

    const body = await request.json()
    const addressId = body.address_id
    if (!addressId) {
      return customerError(request, "Address id is required.", 400)
    }

    const existing = await db.customerLocation.findFirst({
      where: { id: addressId, customerId: customer.id },
    })
    if (!existing) {
      return customerError(request, "Address not found.", 404)
    }

    if (body.is_default) {
      await clearDefaultAddresses(customer.id)
    }

    const address = await db.customerLocation.update({
      where: { id: addressId },
      data: {
        label: mapLabel(body.address_label || existing.label),
        address: body.address_line_1?.trim() || existing.address,
        address2: body.address_line_2?.trim() || null,
        city: body.city?.trim() || existing.city,
        state: body.state?.trim() || existing.state,
        postcode: body.pincode?.trim() || existing.postcode,
        isDefault: Boolean(body.is_default),
      },
    })

    return customerJson(request, {
      success: true,
      message: "Address updated successfully.",
      data: mapAddress(address),
    })
  } catch (error) {
    console.error("Customer edit address error:", error)
    return customerError(request, "Failed to edit address.", 500)
  }
}
