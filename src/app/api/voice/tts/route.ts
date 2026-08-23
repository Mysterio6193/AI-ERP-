import { NextRequest, NextResponse } from "next/server"
import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { synthesizeSpeech } from "@/lib/voice/tts"

export const maxDuration = 30

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { text, voice, language } = body

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ success: false, error: "text is required" }, { status: 400 })
    }

    const { buffer, mimeType } = await synthesizeSpeech({
      text: text.trim(),
      voice,
      language,
    })

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    })
  } catch (error) {
    console.error("Speech synthesis failed:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to synthesize speech",
      },
      { status: 500 }
    )
  }
}
