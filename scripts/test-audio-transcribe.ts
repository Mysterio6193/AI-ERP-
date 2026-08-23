import { env } from "../src/lib/env"

async function testAudio() {
  const apiKey = process.env.OPENROUTER_API_KEY
  console.log("Testing audio transcription via OpenRouter with gemini-2.5-flash...")

  // Generate a tiny valid wav file buffer or test text
  const dummyWavBase64 = "UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAP8A/w=="

  // Method 1: test OpenRouter input_audio format
  const res1 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://supplysure.os",
      "X-Title": "SupplySure OS",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe the audio or state [empty audio] if silence." },
            {
              type: "input_audio",
              input_audio: {
                data: dummyWavBase64,
                format: "wav"
              }
            }
          ]
        }
      ],
      max_tokens: 200,
    })
  })

  const text1 = await res1.text()
  console.log("Res 1 (input_audio format):", res1.status, text1)

  // Method 2: test data URI format
  const res2 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://supplysure.os",
      "X-Title": "SupplySure OS",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe the audio or state [empty audio] if silence." },
            {
              type: "image_url",
              image_url: {
                url: `data:audio/wav;base64,${dummyWavBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 200,
    })
  })

  const text2 = await res2.text()
  console.log("Res 2 (data URI format):", res2.status, text2)
}

testAudio().catch(console.error)
