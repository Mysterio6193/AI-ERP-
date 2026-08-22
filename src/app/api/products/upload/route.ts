import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { requireAdminUser } from "@/lib/admin-auth"

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9.\-_]/g, "-").toLowerCase()
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"])
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminUser(request, ["admin", "sales", "warehouse"])
    if (auth.response) {
      return auth.response
    }

    const formData = await request.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "An image file is required." },
        { status: 400 }
      )
    }

    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json(
        { success: false, error: "Only JPG, PNG, WEBP, or GIF files are allowed." },
        { status: 400 }
      )
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image must be 5MB or smaller." },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadDir = path.join(process.cwd(), "public", "uploads", "products")
    await mkdir(uploadDir, { recursive: true })

    const filename = `${Date.now()}-${randomUUID()}-${sanitizeFilename(file.name || "product-image.bin")}`
    const diskPath = path.join(uploadDir, filename)
    await writeFile(diskPath, buffer)

    const urlPath = `/uploads/products/${filename}`
    const origin = new URL(request.url).origin

    return NextResponse.json({
      success: true,
      data: {
        url: `${origin}${urlPath}`,
        path: urlPath,
        filename,
        contentType: file.type,
        size: file.size,
      },
    })
  } catch (error) {
    console.error("Error uploading product image:", error)
    return NextResponse.json(
      { success: false, error: "Failed to upload product image." },
      { status: 500 }
    )
  }
}
