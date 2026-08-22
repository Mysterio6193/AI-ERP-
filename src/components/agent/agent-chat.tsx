"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai"
import {
  AlertTriangle,
  Check,
  Cpu,
  FileText,
  Loader2,
  Mic,
  Volume2,
  VolumeX,
  Paperclip,
  Send,
  Sparkles,
  Wrench,
  X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

interface RuntimeInfo {
  mode: "gateway" | "local"
  model: string
  configured: boolean
}

interface AgentChatProps {
  threadKey?: string
  suggestions?: string[]
  /** Extra context about the page the agent was opened from. */
  pageContext?: string
  compact?: boolean
}

const DEFAULT_SUGGESTIONS = [
  "How are we tracking today?",
  "Who's overdue and by how much?",
  "Which products are out of stock?",
  "Show me the last 5 orders",
]

/**
 * The Web Speech API is not in TypeScript's DOM lib, and it is only present in
 * Chromium-based browsers. Both facts are handled here rather than at each use.
 */
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") {
    return null
  }

  const candidate = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }

  return candidate.SpeechRecognition || candidate.webkitSpeechRecognition || null
}

/** Turns a tool name into something a human reads while it runs. */
function toolLabel(toolName: string) {
  const labels: Record<string, string> = {
    searchProducts: "Searching the catalog",
    getStock: "Checking stock",
    listOrders: "Looking up orders",
    getOrder: "Opening the order",
    listInvoices: "Checking invoices",
    quoteBasket: "Pricing the basket",
    findCustomers: "Finding the customer",
    getCustomer: "Reading the account",
    listTasks: "Checking tasks",
    businessSnapshot: "Pulling today's numbers",
    createSalesOrder: "Creating the order",
    createTask: "Creating a task",
    completeTask: "Closing the task",
    logCustomerNote: "Logging a note",
    updateOrderStatus: "Updating the order",
    recordPayment: "Recording the payment",
  }

  return labels[toolName] || `Running ${toolName}`
}

export function AgentChat({ threadKey, suggestions, pageContext, compact }: AgentChatProps) {
  const [input, setInput] = useState("")
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [files, setFiles] = useState<FileList | undefined>()
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(() =>
    typeof window !== "undefined" ? Boolean(getSpeechRecognition()) : false
  )
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  // Reading replies aloud completes the hands-free loop dictation started:
  // useful in a van or on a warehouse floor, where reading a screen is the
  // actual barrier. Browser speech synthesis, so it needs no credential and no
  // audio leaves the machine.
  const [speaking, setSpeaking] = useState(false)
  const speechSupported =
    typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined"
  const spokenRef = useRef<string | null>(null)

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/chat",
        body: { threadKey },
      }),
    [threadKey]
  )

  const { messages, sendMessage, status, error, addToolApprovalResponse, setMessages } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })

  const busy = status === "submitted" || status === "streaming"

  useEffect(() => {
    if (!speaking || !speechSupported || busy) {
      return
    }

    const last = messages[messages.length - 1]
    if (!last || last.role !== "assistant") {
      return
    }

    const text = (last.parts || [])
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim()

    // Only once per message, and only once it has stopped streaming —
    // otherwise every token restarts the utterance.
    if (!text || spokenRef.current === last.id) {
      return
    }

    spokenRef.current = last.id
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }, [messages, busy, speaking, speechSupported])

  useEffect(() => {
    // Never keep talking after the panel closes.
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  useEffect(() => {
    const params = threadKey ? `?threadKey=${encodeURIComponent(threadKey)}` : ""

    fetch(`/api/agent/chat${params}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!payload.success) {
          return
        }

        setRuntime(payload.data.runtime)

        if (payload.data.history?.length) {
          setMessages(payload.data.history)
        }
      })
      .catch(() => undefined)
  }, [threadKey, setMessages])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, status])

  useEffect(() => {
    return () => recognitionRef.current?.stop()
  }, [])

  // Dictation for the warehouse and the van, where typing is impractical.
  function toggleDictation() {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = "en-AU"
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim()

      setInput(transcript)
    }

    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  const promptSuggestions = useMemo(() => suggestions || DEFAULT_SUGGESTIONS, [suggestions])

  function submit(text: string) {
    const trimmed = text.trim()
    const hasFiles = Boolean(files?.length)

    if ((!trimmed && !hasFiles) || busy) {
      return
    }

    // A bare attachment still needs an instruction for the model to act on.
    const prompt = trimmed || "Read this and tell me what it is, then draft whatever it implies."

    setInput("")
    void sendMessage({
      text: pageContext ? `${prompt}\n\n(Context: ${pageContext})` : prompt,
      files,
    })
    setFiles(undefined)

    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="flex h-full flex-col">
      {runtime && !runtime.configured ? (
        <Card className="mb-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="flex gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">No model configured</p>
              <p className="text-muted-foreground">
                Set <code className="font-mono">AI_GATEWAY_API_KEY</code>, or run Ollama and set{" "}
                <code className="font-mono">AGENT_PROVIDER=local</code> to keep everything on this
                machine.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
            <div className="rounded-full bg-muted p-4">
              <Sparkles className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="grid w-full max-w-md gap-2">
              {promptSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => submit(suggestion)}
                  className="rounded-lg border bg-card px-4 py-2.5 text-left text-sm transition-colors hover:bg-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => (
          <div key={message.id} className="space-y-2">
            {message.parts.map((part, index) => {
              const key = `${message.id}-${index}`

              if (part.type === "text") {
                return (
                  <div
                    key={key}
                    className={
                      message.role === "user"
                        ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground"
                        : "w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm"
                    }
                  >
                    {part.text}
                  </div>
                )
              }

              if (part.type === "file") {
                const filePart = part as { url?: string; mediaType?: string; filename?: string }

                return filePart.mediaType?.startsWith("image/") ? (
                  <img
                    key={key}
                    src={filePart.url}
                    alt={filePart.filename || "attachment"}
                    className="ml-auto max-h-48 rounded-lg border"
                  />
                ) : (
                  <div
                    key={key}
                    className="ml-auto flex w-fit items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {filePart.filename || "Attachment"}
                  </div>
                )
              }

              if (!part.type.startsWith("tool-")) {
                return null
              }

              const toolPart = part as {
                type: string
                state?: string
                approval?: { id: string; isAutomatic?: boolean }
              }
              const toolName = toolPart.type.replace(/^tool-/, "")

              if (
                toolPart.state === "approval-requested" &&
                toolPart.approval &&
                !toolPart.approval.isAutomatic
              ) {
                const approvalId = toolPart.approval.id

                return (
                  <Card key={key} className="max-w-[85%] border-amber-300">
                    <CardContent className="space-y-3 p-4">
                      <div>
                        <p className="text-sm font-medium">{toolLabel(toolName)} needs your approval</p>
                        <p className="text-xs text-muted-foreground">
                          This action is over the limit the agent can act on alone.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addToolApprovalResponse({ id: approvalId, approved: false })}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              }

              const running =
                toolPart.state !== "output-available" && toolPart.state !== "output-error"

              return (
                <div key={key} className="flex items-center gap-2 text-xs text-muted-foreground">
                  {running ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wrench className="h-3 w-3" />
                  )}
                  {toolLabel(toolName)}
                  {running ? "…" : ""}
                </div>
              )
            })}
          </div>
        ))}

        {error ? (
          <div className="w-fit max-w-[85%] rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm">
            {error.message}
          </div>
        ) : null}

        {status === "submitted" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </div>
        ) : null}

        <div ref={endRef} />
      </div>

      <div className={compact ? "pt-3" : "border-t pt-4"}>
        {files?.length ? (
          <div className="flex flex-wrap gap-2 pb-2">
            {Array.from(files).map((file) => (
              <span
                key={file.name}
                className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs"
              >
                <FileText className="h-3 w-3" />
                {file.name}
              </span>
            ))}
            <button
              onClick={() => {
                setFiles(undefined)
                if (fileInputRef.current) {
                  fileInputRef.current.value = ""
                }
              }}
              className="text-xs text-muted-foreground underline"
            >
              clear
            </button>
          </div>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(event) => setFiles(event.target.files || undefined)}
        />

        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11 shrink-0"
            onClick={() => fileInputRef.current?.click()}
            title="Attach a photo of an invoice or written order"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                submit(input)
              }
            }}
            placeholder="Ask anything, or tell the agent what to do…"
            className="max-h-40 min-h-[44px] resize-none"
            rows={1}
          />
          {voiceSupported ? (
            <Button
              size="icon"
              variant={listening ? "default" : "outline"}
              className="h-11 w-11 shrink-0"
              onClick={toggleDictation}
              title={listening ? "Stop dictation" : "Dictate"}
            >
              <Mic className="h-4 w-4" />
            </Button>
          ) : null}
          {speechSupported ? (
            <Button
              size="icon"
              variant={speaking ? "default" : "outline"}
              className="h-11 w-11 shrink-0"
              onClick={() => {
                setSpeaking((current) => {
                  if (current) window.speechSynthesis.cancel()
                  // Don't read out whatever is already on screen when switched on.
                  spokenRef.current = messages[messages.length - 1]?.id ?? null
                  return !current
                })
              }}
              title={speaking ? "Stop reading replies aloud" : "Read replies aloud"}
            >
              {speaking ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          ) : null}
          <Button
            size="icon"
            className="h-11 w-11 shrink-0"
            disabled={busy || (!input.trim() && !files?.length)}
            onClick={() => submit(input)}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {runtime ? (
          <div className="pt-2">
            <Badge
              variant={runtime.configured ? "secondary" : "destructive"}
              className="gap-1.5 text-[10px]"
            >
              <Cpu className="h-3 w-3" />
              {runtime.mode === "local" ? "Local" : "Cloud"} · {runtime.model}
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  )
}
