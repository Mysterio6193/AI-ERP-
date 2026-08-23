import { NextRequest, NextResponse } from "next/server"
import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { processDocumentOcr } from "@/lib/ocr/engine"

export const maxDuration = 120

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const contentType = request.headers.get("content-type") || ""

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const file = formData.get("file") as File | null
      const modelOverride = formData.get("model") as string | null

      if (!file) {
        return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const base64 = buffer.toString("base64")
      const mimeType = file.type || "image/jpeg"

      const document = await processDocumentOcr({
        imageBase64: base64,
        mimeType,
        modelOverride: modelOverride || undefined,
      })

      return NextResponse.json({ success: true, data: document })
    }

    const body = await request.json().catch(() => ({}))
    const { imageUrl, imageBase64, mimeType, rawText, model } = body

    if (!imageUrl && !imageBase64 && !rawText) {
      return NextResponse.json(
        { success: false, error: "Either file, imageUrl, imageBase64, or rawText must be provided" },
        { status: 400 }
      )
    }

    const document = await processDocumentOcr({
      imageUrl,
      imageBase64,
      mimeType,
      rawText,
      modelOverride: model || undefined,
    })

    return NextResponse.json({ success: true, data: document })
  } catch (error) {
    console.error("OCR Scan Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to extract data from document",
      },
      { status: 500 }
    )
  }
}
