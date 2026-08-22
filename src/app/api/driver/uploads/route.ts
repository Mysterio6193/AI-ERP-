import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { randomUUID } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { requireDriverSession } from "@/lib/driver-auth"

function sanitizeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9.\-_]/g, "-").toLowerCase()
}

export async function POST(request: NextRequest) {
  try {
    const driver = await requireDriverSession(request)
    if (!driver) {
      return NextResponse.json(
        { success: false, error: "Not signed in" },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file")
    const purpose = String(formData.get("purpose") || "proof")

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "A file is required." },
        { status: 400 }
      )
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadDir = path.join(process.cwd(), "public", "uploads", "driver-proof", driver.id)
    await mkdir(uploadDir, { recursive: true })

    const filename = `${Date.now()}-${randomUUID()}-${sanitizeFilename(file.name || `${purpose}.bin`)}`
    const diskPath = path.join(uploadDir, filename)
    await writeFile(diskPath, buffer)

    const urlPath = `/uploads/driver-proof/${driver.id}/${filename}`
    const origin = new URL(request.url).origin

    return NextResponse.json({
      success: true,
      data: {
        url: `${origin}${urlPath}`,
        path: urlPath,
        filename,
        contentType: file.type || "application/octet-stream",
      },
    })
  } catch (error) {
    console.error("Error uploading driver proof asset:", error)
    return NextResponse.json(
      { success: false, error: "Failed to upload file" },
      { status: 500 }
    )
  }
}
