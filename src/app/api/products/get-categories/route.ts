import { NextRequest } from "next/server"

import { db } from "@/lib/db"
import { customerError, customerJson, customerOptions, mapCategory } from "@/lib/customer-api"

export function OPTIONS(request: NextRequest) {
  return customerOptions(request)
}

export async function GET(request: NextRequest) {
  try {
    const categories = await db.category.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { name: "asc" },
        },
      },
      orderBy: { name: "asc" },
    })

    return customerJson(request, {
      success: true,
      message: "Categories fetched successfully.",
      data: categories.map(mapCategory),
    })
  } catch (error) {
    console.error("Customer categories error:", error)
    return customerError(request, "Failed to fetch categories.", 500)
  }
}
