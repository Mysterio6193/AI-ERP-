import { generateText } from "ai"
import { resolveAgentModel, getModelId } from "@/lib/agent/model"
import { TRANSCRIPTION_PROMPT } from "@/lib/voice/language"

export interface TranscriptionResult {
  text: string
  durationSeconds?: number
  language?: string
  confidence?: number
}

// Asking for English silently translated whatever was said, so a Hindi or
// Italian message came back as an English paraphrase and nobody reviewing it
// could tell it had been reworded.
const VOICE_SYSTEM_PROMPT = TRANSCRIPTION_PROMPT

export async function transcribeAudio(input: {
  audioBase64?: string
  audioBuffer?: Buffer
  mimeType?: string
  modelOverride?: string
}): Promise<TranscriptionResult> {
  let mime = input.mimeType || "audio/webm"
  if (mime === "application/octet-stream" || mime.includes("oga") || mime.includes("opus")) {
    mime = "audio/ogg"
  }

  let base64 = input.audioBase64 || ""
  if (input.audioBuffer) {
    base64 = input.audioBuffer.toString("base64")
  }

  base64 = base64.replace(/^data:audio\/[a-z0-9_-]+;base64,/, "")

  if (!base64) {
    throw new Error("No audio data provided for transcription.")
  }

  const apiKey = process.env.OPENROUTER_API_KEY
  const model = input.modelOverride || process.env.AGENT_MODEL_VOICE || "google/gemini-2.5-flash"

  if (apiKey) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://supplysure.os",
          "X-Title": "SupplySure OS",
        },
        body: JSON.stringify({
          model: model.includes("whisper") ? "google/gemini-2.5-flash" : model,
          messages: [
            {
              role: "system",
              content: VOICE_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Please transcribe everything spoken in this audio recording accurately into text. Do not summarize or add commentary, just output the exact words.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mime};base64,${base64}`,
                  },
                },
              ],
            },
          ],
          max_tokens: 1500,
        }),
      })

      if (response.ok) {
        const data = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>
        }
        const text = data.choices?.[0]?.message?.content?.trim() || ""
        if (text && text !== "[empty audio]") {
          return {
            text,
            language: "en-AU",
          }
        }
      } else {
        const errText = await response.text()
        console.warn("OpenRouter audio transcription response not ok:", response.status, errText)
      }
    } catch (apiError) {
      console.warn("OpenRouter direct audio transcription error:", apiError)
    }
  }

  // AI SDK fallback
  const resolvedModel = resolveAgentModel({
    model: input.modelOverride,
    purpose: "voice",
    tier: "fast",
  })

  const result = await generateText({
    model: resolvedModel,
    system: VOICE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Transcribe this audio recording.\nData: data:${mime};base64,${base64.slice(0, 100)}...`,
      },
    ],
    maxOutputTokens: 1500,
  })

  return {
    text: result.text.trim(),
    language: "en-AU",
  }
}
