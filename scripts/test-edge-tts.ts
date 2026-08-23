/**
 * Microsoft Edge Neural Speech Synthesizer (Native WebSocket)
 * Zero cost, studio quality, human-grade natural voices:
 * - en-AU-NatashaNeural (Australian natural)
 * - en-AU-WilliamNeural (Australian natural)
 * - en-US-JennyNeural (US natural)
 * - en-US-GuyNeural (US natural)
 * - en-US-AndrewMultilingualNeural
 */

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EA654D9D831FFB2B802355CD"
const EDGE_WS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`

export async function synthesizeEdgeNeuralSpeech(
  text: string,
  voice: string = "en-AU-NatashaNeural"
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(EDGE_WS_URL)
    const audioChunks: Buffer[] = []
    const requestId = crypto.randomUUID().replace(/-/g, "")

    const timeout = setTimeout(() => {
      try {
        ws.close()
      } catch {}
      reject(new Error("Edge Neural TTS timeout"))
    }, 10000)

    ws.onopen = () => {
      // 1. Send speech config
      const configMessage =
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        })
      ws.send(configMessage)

      // 2. Send SSML request with natural prosody
      const ssml =
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${voice}'>` +
        `<prosody rate='+0%' pitch='+0%'>` +
        `${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}` +
        `</prosody></voice></speak>`

      const ssmlMessage =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml

      ws.send(ssmlMessage)
    }

    ws.onmessage = async (event) => {
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout)
          try {
            ws.close()
          } catch {}
          resolve(Buffer.concat(audioChunks))
        }
      } else if (event.data instanceof Blob) {
        const arrayBuf = await event.data.arrayBuffer()
        const buf = Buffer.from(arrayBuf)
        // Find binary header delimiter \r\n\r\n or Path:audio
        const headerLen = buf.readUInt16BE(0)
        if (buf.length > headerLen + 2) {
          const audio = buf.subarray(headerLen + 2)
          audioChunks.push(audio)
        }
      } else if (event.data instanceof ArrayBuffer) {
        const buf = Buffer.from(event.data)
        const headerLen = buf.readUInt16BE(0)
        if (buf.length > headerLen + 2) {
          const audio = buf.subarray(headerLen + 2)
          audioChunks.push(audio)
        }
      }
    }

    ws.onerror = (err) => {
      clearTimeout(timeout)
      reject(err)
    }
  })
}

async function main() {
  console.log("Synthesizing studio-grade natural speech via Edge Neural TTS...")
  const start = Date.now()
  const sample = "Hey mate, I checked the stock for Roma Tomatoes and Extra Virgin Olive Oil. Neither is in our Sydney warehouse right now, but I can check alternative SKUs or place a purchase order if you need them."
  const audio = await synthesizeEdgeNeuralSpeech(sample, "en-AU-NatashaNeural")
  const duration = Date.now() - start
  console.log(`✅ Success in ${duration}ms! Generated audio size: ${audio.length} bytes`)
}

if (process.argv[1]?.includes("test-edge-tts")) {
  main().catch((err) => {
    console.error("Test failed:", err)
  })
}
