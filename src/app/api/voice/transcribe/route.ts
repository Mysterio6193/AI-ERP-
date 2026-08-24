import { NextRequest, NextResponse } from "next/server"
import { getAdminUserFromRequest } from "@/lib/admin-auth"
import { transcribeAudio } from "@/lib/voice/transcribe"
import { guardRate, RATE_LIMITS } from "@/lib/rate-guard"

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const user = await getAdminUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
  }

  // Each transcription is a longer, dearer request than a chat turn, so this
  // is tighter.
  const limited = guardRate(request, {
    ...RATE_LIMITS.voiceTranscribe,
    subject: user.id,
    message: "Too many recordings at once. Wait a moment and try again.",
  })
  if (limited) return limited

  try {
    const contentType = request.headers.get("content-type") || ""

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData()
      const file = formData.get("file") as File | null
      const modelOverride = formData.get("model") as string | null

      if (!file) {
        return NextResponse.json({ success: false, error: "No audio file uploaded" }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const mimeType = file.type || "audio/webm"

      const result = await transcribeAudio({
        audioBuffer: buffer,
        mimeType,
        modelOverride: modelOverride || undefined,
      })

      return NextResponse.json({ success: true, data: result })
    }

    const body = await request.json().catch(() => ({}))
    const { audioBase64, mimeType, model } = body

    if (!audioBase64) {
      return NextResponse.json({ success: false, error: "audioBase64 is required" }, { status: 400 })
    }

    const result = await transcribeAudio({
      audioBase64,
      mimeType,
      modelOverride: model || undefined,
    })

    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    console.error("Voice transcription failed:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to transcribe audio",
      },
      { status: 500 }
    )
  }
}
