/**
 * High-Definition Natural Neural Voice Engine for SupplySure OS
 *
 * Provides ultra-realistic, low-latency conversational speech synthesis (Edge Neural TTS / OpenAI TTS).
 * Strips boilerplate and formats responses into human-like conversational voice notes.
 */

import fs from "fs"
import os from "os"
import path from "path"
import crypto from "crypto"
import { EdgeTTS } from "node-edge-tts"

export interface SynthesizeSpeechOptions {
  text: string
  voice?: string
  language?: string
}

/**
 * Strips markdown, repetitive boilerplate signatures, email addresses,
 * and formats the text into crisp, conversational human speech.
 */
export function cleanTextForSpeech(text: string): string {
  let cleaned = text
    // Strip agent signatures and disclosure boilerplate
    .replace(/SupplySure Assistant/gi, "")
    .replace(/I['’]m the automated assistant[\s\S]*?if you['’]d rather\.?/gi, "")
    .replace(/Reply and a person will pick it up[\s\S]*?if you['’]d rather\.?/gi, "")
    .replace(/orders@localhost/gi, "")
    .replace(/Pending Approvals: \d+/gi, "")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Remove markdown links [title](url) -> title
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove bold/italics/bullet markers
    .replace(/[*_~]{1,3}/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    // Remove tables
    .replace(/\|/g, " ")
    .replace(/[-:]{3,}/g, "")
    // Remove excessive newlines and whitespace
    .replace(/\s+/g, " ")
    .trim()

  // For natural spoken conversation, keep it concise (under ~280 chars / 2-3 sentences)
  if (cleaned.length > 280) {
    const sentences = cleaned.split(/(?<=[.?!])\s+/)
    if (sentences.length > 2) {
      cleaned = sentences.slice(0, 2).join(" ")
    } else {
      const lastPeriod = cleaned.lastIndexOf(".", 260)
      if (lastPeriod > 100) {
        cleaned = cleaned.slice(0, lastPeriod + 1)
      } else {
        cleaned = cleaned.slice(0, 260) + "..."
      }
    }
  }

  return cleaned
}

/**
 * Synthesizes ultra-natural, studio-grade spoken audio buffer (MP3) from text.
 */
export async function synthesizeSpeech(options: SynthesizeSpeechOptions): Promise<{ buffer: Buffer; mimeType: string }> {
  const textToSpeak = cleanTextForSpeech(options.text)
  if (!textToSpeak) {
    throw new Error("No readable text provided for speech synthesis.")
  }

  const voiceName = options.voice || process.env.EDGE_TTS_VOICE || "en-AU-NatashaNeural"

  // Method 1: Edge Neural High-Definition Speech (Fast, local, zero cost)
  try {
    const tts = new EdgeTTS({
      voice: voiceName,
      lang: options.language || "en-AU",
      outputFormat: "audio-24khz-48kbitrate-mono-mp3",
    })

    const tempFile = path.join(os.tmpdir(), `tts_${crypto.randomUUID()}.mp3`)
    await tts.ttsPromise(textToSpeak, tempFile)

    if (fs.existsSync(tempFile)) {
      const buffer = fs.readFileSync(tempFile)
      fs.unlinkSync(tempFile)
      if (buffer && buffer.length > 500) {
        return {
          buffer,
          mimeType: "audio/mpeg",
        }
      }
    }
  } catch (edgeError) {
    console.warn("Edge Neural TTS note, trying OpenRouter Fish Audio fallback:", edgeError)
  }

  // Method 2: OpenRouter Fish Audio TTS (fish-audio/s2.1-pro-free) / OpenAI TTS
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const isOR = Boolean(process.env.OPENROUTER_API_KEY)
      const ttsUrl = isOR
        ? "https://openrouter.ai/api/v1/audio/speech"
        : "https://api.openai.com/v1/audio/speech"

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }

      if (isOR) {
        headers["HTTP-Referer"] = "https://supplysure.os"
        headers["X-Title"] = "SupplySure OS"
      }

      const model = isOR
        ? process.env.AGENT_TTS_MODEL || "fish-audio/s2.1-pro-free"
        : "tts-1"

      const response = await fetch(ttsUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          input: textToSpeak,
          voice: options.voice || (isOR ? "b347db033a6549378b48d00acb0d06cd" : "nova"),
          response_format: "mp3",
        }),
      })

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        if (buffer.length > 200) {
          return {
            buffer,
            mimeType: response.headers.get("content-type") || "audio/mpeg",
          }
        }
      } else {
        const err = await response.text()
        console.warn("OpenRouter TTS API response not ok:", response.status, err)
      }
    } catch (apiTtsError) {
      console.warn("OpenRouter Fish Audio TTS error:", apiTtsError)
    }
  }

  // Method 3: Fast Neural Chunked Speech Fallback
  try {
    const encoded = encodeURIComponent(textToSpeak.slice(0, 180))
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encoded}`
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    })
    if (response.ok) {
      const ab = await response.arrayBuffer()
      return {
        buffer: Buffer.from(ab),
        mimeType: "audio/mpeg",
      }
    }
  } catch {}

  throw new Error("Failed to synthesize speech audio.")
}
