import { synthesizeSpeech, cleanTextForSpeech } from "../src/lib/voice/tts"

async function main() {
  console.log("=========================================")
  console.log("TESTING TEXT-TO-SPEECH (TTS) AUDIO GENERATION")
  console.log("=========================================")

  const sampleText = `
**Daily Stock Update:**
We currently have *45 cartons* of [Roma Tomatoes](https://supplysure.os/products/123) in the Sydney DC.
Extra Virgin Olive Oil has 12 tins available.

| Product | Stock |
| Roma Tomatoes | 45 |
| Olive Oil | 12 |

Please review pending purchase orders.
`

  console.log("1. Original Text:", sampleText)
  const cleaned = cleanTextForSpeech(sampleText)
  console.log("\n2. Cleaned for Speech:", cleaned)

  console.log("\n3. Synthesizing audio buffer...")
  const speech = await synthesizeSpeech({ text: cleaned })
  console.log("✅ Synthesized audio result:", {
    byteLength: speech.buffer.byteLength,
    mimeType: speech.mimeType,
  })

  if (speech.buffer.byteLength > 1000) {
    console.log("🎉 TTS Engine successfully generated voice note MP3 audio!")
  } else {
    throw new Error("Generated audio buffer is too small.")
  }
}

main().catch((err) => {
  console.error("TTS test failed:", err)
  process.exit(1)
})
