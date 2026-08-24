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
import { chooseVoice } from "@/lib/voice/language"

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

  // Was always en-AU, whatever the reply said. An Italian or Hindi answer read
  // by an Australian English voice is unintelligible, so the voice follows the
  // words unless a caller names one.
  const detected = chooseVoice(textToSpeak)

  // EDGE_TTS_VOICE is the default English voice, not an override of a detected
  // language — otherwise setting it would silently return every Hindi and
  // Italian reply to an Australian English voice.
  const configuredDefault =
    detected.language === "en-AU" ? process.env.EDGE_TTS_VOICE : undefined

  const voiceName = options.voice || configuredDefault || detected.voice
  const voiceLanguage = options.language || detected.language

  // Method 1: Edge Neural High-Definition Speech (Zero cost, ultra-natural, fast)
  try {
    const tts = new EdgeTTS({
      voice: voiceName,
      lang: voiceLanguage,
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
    console.warn("Edge Neural TTS note, trying secondary fallback:", edgeError)
  }

  // Method 2: OpenRouter / OpenAI TTS fallback
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
  if (apiKey) {
    try {
      const ttsUrl = process.env.OPENROUTER_API_KEY
        ? "https://openrouter.ai/api/v1/audio/speech"
        : "https://api.openai.com/v1/audio/speech"

      const response = await fetch(ttsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          input: textToSpeak,
          voice: "nova",
        }),
      })

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer()
        return {
          buffer: Buffer.from(arrayBuffer),
          mimeType: "audio/mpeg",
        }
      }
    } catch (apiTtsError) {
      console.warn("OpenAI/OpenRouter TTS fallback note:", apiTtsError)
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
