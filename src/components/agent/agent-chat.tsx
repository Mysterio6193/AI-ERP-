"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import ReactMarkdown from "react-markdown"
import { useChat } from "@ai-sdk/react"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai"
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Cpu,
  FileText,
  Globe,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  RotateCcw,
  Send,
  Share2,
  Sparkles,
  User,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Youtube,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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

const CATEGORIZED_SUGGESTIONS = [
  {
    category: "Market & Socials",
    icon: Globe,
    items: [
      "Run a social sentiment scan on cold chain logistics on Reddit & Twitter",
      "Extract and summarize YouTube transcript: https://www.youtube.com/watch?v=...",
      "Search Reddit for common supplier delivery complaints",
    ],
  },
  {
    category: "Stock & Orders",
    icon: Sparkles,
    items: [
      "Which products are below reorder level?",
      "Show me the last 5 orders and their fulfillment status",
      "What's currently out of stock?",
    ],
  },
  {
    category: "Finance & Invoices",
    icon: FileText,
    items: [
      "Who's overdue on invoices and by how much?",
      "Pull today's cashflow and business snapshot",
      "Draft a chase email for the largest outstanding balance",
    ],
  },
]

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
  if (typeof window === "undefined") return null
  const candidate = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike
    webkitSpeechRecognition?: new () => SpeechRecognitionLike
  }
  return candidate.SpeechRecognition || candidate.webkitSpeechRecognition || null
}

function toolIconAndLabel(toolName: string) {
  if (toolName.includes("Youtube")) return { label: "YouTube Intelligence", icon: Youtube }
  if (toolName.includes("Reddit") || toolName.includes("Twitter") || toolName.includes("Social") || toolName.includes("LinkedIn")) {
    return { label: `Socials · ${toolName}`, icon: Globe }
  }
  if (toolName.includes("Web") || toolName.includes("search")) {
    return { label: `Web Intelligence · ${toolName}`, icon: Globe }
  }

  const labels: Record<string, string> = {
    searchProducts: "Searching the catalog",
    getStock: "Checking stock levels",
    listOrders: "Looking up orders",
    getOrder: "Opening order details",
    listInvoices: "Checking accounts & invoices",
    quoteBasket: "Pricing quotation basket",
    findCustomers: "Finding customer account",
    getCustomer: "Reading account profile",
    listTasks: "Checking operational tasks",
    businessSnapshot: "Pulling business snapshot",
    createSalesOrder: "Creating sales order",
    createTask: "Creating task",
    completeTask: "Closing task",
    logCustomerNote: "Logging customer note",
    updateOrderStatus: "Updating order status",
    recordPayment: "Recording payment",
    readCleanWebpage: "Reading clean webpage (Jina)",
    getYoutubeTranscript: "Extracting YouTube transcript",
    searchReddit: "Searching Reddit discussions",
    searchTwitter: "Searching Twitter/X posts",
    searchLinkedIn: "Searching LinkedIn company profiles",
    searchInstagram: "Searching Instagram visuals",
    searchTikTok: "Searching TikTok trends",
    aggregateSocialSentiment: "Aggregating multi-social sentiment radar",
    searchGithub: "Searching GitHub repositories",
    readRssFeed: "Parsing RSS/Atom feed",
    agentReachDoctor: "Running Agent Reach diagnostics",
  }

  return { label: labels[toolName] || `Executing ${toolName}`, icon: Wrench }
}

const CHAT_MODEL_PRESETS = [
  { label: "Auto / Purpose Default", value: "", provider: "Smart Auto" },
  { label: "Google Gemini 2.5 Flash", value: "google/gemini-2.5-flash", provider: "Google" },
  { label: "DeepSeek V3 / Chat", value: "deepseek/deepseek-chat", provider: "DeepSeek" },
  { label: "MiniMax M3 (Free)", value: "minimax/minimax-m3:free", provider: "MiniMax" },
  { label: "Nemotron 3 Super 120B (Free)", value: "nvidia/nemotron-3-super-120b-a12b:free", provider: "NVIDIA" },
  { label: "Nemotron 3.5 Lightning (Free)", value: "nvidia/nemotron-3.5-lightning:free", provider: "NVIDIA" },
  { label: "Llama 3.3 70B", value: "meta-llama/llama-3.3-70b-instruct", provider: "Meta" },
  { label: "Qwen 2.5 72B", value: "qwen/qwen-2.5-72b-instruct", provider: "Alibaba" },
]

export function AgentChat({ threadKey, suggestions, pageContext, compact }: AgentChatProps) {
  const [input, setInput] = useState("")
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null)
  const [selectedModel, setSelectedModel] = useState("")
  const [files, setFiles] = useState<FileList | undefined>()
  const [scanningOcr, setScanningOcr] = useState(false)
  const [listening, setListening] = useState(false)
  const [recordingAudio, setRecordingAudio] = useState(false)
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null)
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({})

  const [voiceSupported] = useState(() =>
    typeof window !== "undefined" ? Boolean(getSpeechRecognition() || navigator?.mediaDevices?.getUserMedia) : false
  )
  const endRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const [speaking, setSpeaking] = useState(false)
  const speechSupported = typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined"
  const spokenRef = useRef<string | null>(null)

  const activeModelParam = selectedModel || undefined

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent/chat",
        body: { threadKey, model: activeModelParam },
      }),
    [threadKey, activeModelParam]
  )

  const { messages, sendMessage, status, error, addToolApprovalResponse, setMessages } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  })

  const busy = status === "submitted" || status === "streaming" || scanningOcr

  useEffect(() => {
    if (!speaking || !speechSupported || busy) return

    const last = messages[messages.length - 1]
    if (!last || last.role !== "assistant") return

    const text = (last.parts || [])
      .map((part) => (part.type === "text" ? part.text : ""))
      .join(" ")
      .trim()

    if (!text || spokenRef.current === last.id) return

    spokenRef.current = last.id
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }, [messages, busy, speaking, speechSupported])

  useEffect(() => {
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
        if (!payload.success) return
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

  async function startAudioRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        stream.getTracks().forEach((track) => track.stop())
        setRecordingAudio(false)

        try {
          const formData = new FormData()
          formData.append("file", audioBlob, "voice_input.webm")
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: formData })
          const payload = await res.json()
          if (payload.success && payload.data?.text) {
            setInput((prev) => (prev ? `${prev} ${payload.data.text}` : payload.data.text))
          }
        } catch (err) {
          console.error("Transcription error:", err)
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setRecordingAudio(true)
    } catch (err) {
      console.warn("MediaRecorder audio error:", err)
    }
  }

  function stopAudioRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    setRecordingAudio(false)
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    if (recordingAudio) {
      stopAudioRecording()
      return
    }

    const SpeechRecognition = getSpeechRecognition()
    if (SpeechRecognition) {
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
    } else if (typeof navigator?.mediaDevices?.getUserMedia === "function") {
      void startAudioRecording()
    }
  }

  async function handleFileAttachment(fileList: FileList | null) {
    if (!fileList || !fileList.length) {
      setFiles(undefined)
      return
    }
    setFiles(fileList)

    const firstFile = fileList[0]
    if (firstFile && (firstFile.type.startsWith("image/") || firstFile.type === "application/pdf")) {
      setScanningOcr(true)
      try {
        const formData = new FormData()
        formData.append("file", firstFile)
        const response = await fetch("/api/ocr/scan", { method: "POST", body: formData })
        const payload = await response.json()
        if (payload.success && payload.data) {
          const doc = payload.data
          const summary = `[Scanned ${doc.documentType?.replace(/_/g, " ")}: ${doc.vendorName || "Vendor"} #${doc.documentNumber || "N/A"} · $${doc.totalAmount || 0} (${doc.items?.length || 0} items)]`
          setInput((prev) => (prev ? `${prev}\n${summary}` : summary))
        }
      } catch (err) {
        console.warn("OCR attach error:", err)
      } finally {
        setScanningOcr(false)
      }
    }
  }

  function copyToClipboard(text: string, id: string) {
    void navigator.clipboard.writeText(text)
    setCopiedIndex(id)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  function toggleToolDetails(key: string) {
    setExpandedTools((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleResetChat() {
    setMessages([])
    setInput("")
    setFiles(undefined)
  }

  function submit(text: string) {
    const trimmed = text.trim()
    const hasFiles = Boolean(files?.length)

    if ((!trimmed && !hasFiles) || busy) return

    const prompt = trimmed || "Read this attachment and summarize key findings, then draft actions."

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
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden bg-background">
        {/* Top Controls Bar */}
        <div className="flex items-center justify-between border-b bg-card/60 px-3 py-2 text-xs backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <span className="font-semibold tracking-tight">Hermes AI</span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" title="Online" />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border bg-background/80 px-2 py-0.5 shadow-sm">
              <Cpu className="h-3 w-3 text-muted-foreground" />
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="cursor-pointer bg-transparent text-[11px] font-medium outline-none"
              >
                {CHAT_MODEL_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>

            {messages.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={handleResetChat}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>New Conversation</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        {/* Runtime Alert if not configured */}
        {runtime && !runtime.configured ? (
          <Card className="m-3 border-amber-300 bg-amber-50/80 dark:bg-amber-950/30">
            <CardContent className="flex gap-3 p-3 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <p className="font-medium">No cloud model key configured</p>
                <p className="text-muted-foreground">
                  Set <code className="font-mono">GEMINI_API_KEY</code> or <code className="font-mono">OPENROUTER_API_KEY</code> in <code className="font-mono">.env</code>.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Message Thread Scroll Area */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center space-y-6 py-8 text-center">
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-primary/20 via-primary/10 to-transparent shadow-inner">
                <Sparkles className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold tracking-tight">How can Hermes help your supply chain?</h3>
                <p className="text-xs text-muted-foreground">
                  Ask about stock levels, summarize YouTube SOPs, search Reddit complaints, or automate workflows.
                </p>
              </div>

              {/* Categorized Suggestion Grid */}
              <div className="grid w-full max-w-2xl gap-3 text-left">
                {suggestions ? (
                  <div className="grid gap-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => submit(suggestion)}
                        className="group flex items-center justify-between rounded-xl border bg-card/80 p-3 text-xs shadow-sm transition-all hover:border-primary/50 hover:bg-accent/40"
                      >
                        <span className="font-medium text-foreground group-hover:text-primary">{suggestion}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                    ))}
                  </div>
                ) : (
                  CATEGORIZED_SUGGESTIONS.map((cat) => {
                    const CatIcon = cat.icon
                    return (
                      <div key={cat.category} className="space-y-1.5">
                        <div className="flex items-center gap-1.5 px-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                          <CatIcon className="h-3 w-3" />
                          <span>{cat.category}</span>
                        </div>
                        <div className="grid gap-1.5 sm:grid-cols-2">
                          {cat.items.map((item) => (
                            <button
                              key={item}
                              onClick={() => submit(item)}
                              className="group flex items-center justify-between rounded-lg border bg-card/60 p-2.5 text-xs text-left shadow-2xs transition-all hover:border-primary/40 hover:bg-accent/50"
                            >
                              <span className="line-clamp-2 text-foreground/90 group-hover:text-primary">{item}</span>
                              <ChevronRight className="ml-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          ) : null}

          {/* Messages Mapping */}
          {messages.map((message) => (
            <div key={message.id} className="space-y-3">
              {message.parts.map((part, index) => {
                const key = `${message.id}-${index}`

                // 1. Text Message Component
                if (part.type === "text") {
                  const isUser = message.role === "user"

                  return (
                    <div
                      key={key}
                      className={`group flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg shadow-xs ${
                          isUser ? "bg-primary text-primary-foreground" : "border bg-card text-primary"
                        }`}
                      >
                        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>

                      <div className="relative max-w-[85%] space-y-1">
                        <div
                          className={`rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-xs ${
                            isUser
                              ? "rounded-tr-xs bg-primary text-primary-foreground font-normal"
                              : "rounded-tl-xs border bg-card text-card-foreground prose prose-xs dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-table:my-2"
                          }`}
                        >
                          {isUser ? (
                            <p className="whitespace-pre-wrap">{part.text}</p>
                          ) : (
                            <ReactMarkdown
                              components={{
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
                                  >
                                    {children}
                                  </a>
                                ),
                                table: ({ children }) => (
                                  <div className="my-2 overflow-x-auto rounded-lg border">
                                    <table className="w-full text-left text-[11px]">{children}</table>
                                  </div>
                                ),
                                th: ({ children }) => (
                                  <th className="bg-muted/60 px-2.5 py-1.5 font-semibold text-foreground border-b">{children}</th>
                                ),
                                td: ({ children }) => (
                                  <td className="px-2.5 py-1.5 border-b border-muted/40">{children}</td>
                                ),
                                code: ({ children }) => (
                                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">
                                    {children}
                                  </code>
                                ),
                              }}
                            >
                              {part.text}
                            </ReactMarkdown>
                          )}
                        </div>

                        {!isUser ? (
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground"
                              onClick={() => copyToClipboard(part.text, key)}
                              title="Copy response"
                            >
                              {copiedIndex === key ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                }

                // 2. File Attachment Component
                if (part.type === "file") {
                  const filePart = part as { url?: string; mediaType?: string; filename?: string }

                  return filePart.mediaType?.startsWith("image/") ? (
                    <div key={key} className="flex justify-end pr-9">
                      <img
                        src={filePart.url}
                        alt={filePart.filename || "attachment"}
                        className="max-h-48 rounded-xl border shadow-sm"
                      />
                    </div>
                  ) : (
                    <div key={key} className="flex justify-end pr-9">
                      <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2 text-xs shadow-xs">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="font-medium">{filePart.filename || "Attached Document"}</span>
                      </div>
                    </div>
                  )
                }

                // 3. Tool Call & Execution Card
                if (!part.type.startsWith("tool-")) return null

                const toolPart = part as {
                  type: string
                  state?: string
                  approval?: { id: string; isAutomatic?: boolean }
                  args?: any
                  output?: any
                }
                const toolName = toolPart.type.replace(/^tool-/, "")
                const { label: toolTitle, icon: ToolIcon } = toolIconAndLabel(toolName)
                const isExpanded = Boolean(expandedTools[key])

                // Approval Gated Action
                if (toolPart.state === "approval-requested" && toolPart.approval && !toolPart.approval.isAutomatic) {
                  const approvalId = toolPart.approval.id

                  return (
                    <div key={key} className="pl-9">
                      <Card className="max-w-[85%] border-amber-400 bg-amber-50/50 shadow-sm dark:bg-amber-950/20">
                        <CardContent className="space-y-3 p-3.5">
                          <div className="flex items-start gap-2.5">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            <div>
                              <p className="text-xs font-semibold text-foreground">{toolTitle} requires approval</p>
                              <p className="text-[11px] text-muted-foreground">
                                This action modifies platform state or exceeds autonomous policy boundaries.
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              className="h-7 bg-emerald-600 text-xs hover:bg-emerald-700"
                              onClick={() => addToolApprovalResponse({ id: approvalId, approved: true })}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => addToolApprovalResponse({ id: approvalId, approved: false })}
                            >
                              <X className="mr-1 h-3.5 w-3.5" />
                              Reject
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  )
                }

                const isRunning = toolPart.state !== "output-available" && toolPart.state !== "output-error"

                return (
                  <div key={key} className="pl-9">
                    <div className="inline-flex flex-col rounded-lg border bg-card/60 px-3 py-1.5 text-xs shadow-2xs">
                      <button
                        onClick={() => toggleToolDetails(key)}
                        className="flex items-center gap-2 text-left text-muted-foreground hover:text-foreground"
                      >
                        {isRunning ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        ) : (
                          <ToolIcon className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                        <span className="font-mono text-[11px] font-medium text-foreground">{toolTitle}</span>
                        <span className="text-[10px] text-muted-foreground">{isRunning ? "working..." : "done"}</span>
                        {toolPart.args || toolPart.output ? (
                          <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        ) : null}
                      </button>

                      {isExpanded && (toolPart.args || toolPart.output) ? (
                        <div className="mt-2 border-t pt-1.5 font-mono text-[10px] text-muted-foreground">
                          {toolPart.args ? (
                            <div className="mb-1">
                              <span className="font-bold text-foreground">Args:</span>{" "}
                              {JSON.stringify(toolPart.args)}
                            </div>
                          ) : null}
                          {toolPart.output ? (
                            <div>
                              <span className="font-bold text-foreground">Output:</span>{" "}
                              <span className="line-clamp-4">{JSON.stringify(toolPart.output)}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {error ? (
            <div className="pl-9">
              <div className="w-fit max-w-[85%] rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <div className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>Execution Error</span>
                </div>
                <p className="mt-1 text-[11px] opacity-90">{error.message}</p>
              </div>
            </div>
          ) : null}

          {status === "submitted" ? (
            <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Hermes is thinking & searching…</span>
            </div>
          ) : null}

          <div ref={endRef} />
        </div>

        {/* Input & Action Area */}
        <div className={`border-t bg-card/40 p-3 backdrop-blur-sm ${compact ? "p-2.5" : "p-3.5"}`}>
          {files?.length ? (
            <div className="flex flex-wrap gap-1.5 pb-2">
              {Array.from(files).map((file) => (
                <span
                  key={file.name}
                  className="flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs shadow-2xs"
                >
                  <FileText className="h-3 w-3 text-primary" />
                  <span className="max-w-[150px] truncate">{file.name}</span>
                  <button
                    onClick={() => setFiles(undefined)}
                    className="rounded-full hover:bg-muted p-0.5"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {scanningOcr ? (
            <div className="flex items-center gap-2 pb-2 text-xs text-primary animate-pulse font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Scanning document with Vision OCR & parsing line items...</span>
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(event) => void handleFileAttachment(event.target.files)}
          />

          <div className="flex items-end gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 shrink-0 rounded-xl"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attach invoice, receipt, or PDF</TooltipContent>
            </Tooltip>

            <div className="relative flex-1">
              <Textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    submit(input)
                  }
                }}
                placeholder={
                  recordingAudio || listening
                    ? "Listening to your voice..."
                    : "Ask anything, scan an invoice, or search Reddit & YouTube..."
                }
                className={`max-h-36 min-h-[42px] resize-none rounded-xl border-input bg-background/90 px-3.5 py-2.5 text-xs shadow-2xs transition-colors focus-visible:ring-1 focus-visible:ring-primary ${
                  recordingAudio || listening ? "border-red-500/60 bg-red-500/5 ring-1 ring-red-500/40" : ""
                }`}
                rows={1}
              />
            </div>

            {voiceSupported ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={listening || recordingAudio ? "destructive" : "outline"}
                    className="h-10 w-10 shrink-0 rounded-xl"
                    onClick={toggleVoice}
                  >
                    {listening || recordingAudio ? (
                      <Mic className="h-4 w-4 animate-pulse" />
                    ) : (
                      <MicOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{listening || recordingAudio ? "Stop recording" : "Voice dictation"}</TooltipContent>
              </Tooltip>
            ) : null}

            {speechSupported ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant={speaking ? "default" : "outline"}
                    className="h-10 w-10 shrink-0 rounded-xl"
                    onClick={() => {
                      setSpeaking((current) => {
                        if (current) window.speechSynthesis.cancel()
                        spokenRef.current = messages[messages.length - 1]?.id ?? null
                        return !current
                      })
                    }}
                  >
                    {speaking ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{speaking ? "Mute auto-read aloud" : "Read replies aloud"}</TooltipContent>
              </Tooltip>
            ) : null}

            <Button
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl bg-primary shadow-xs hover:bg-primary/90"
              disabled={busy || (!input.trim() && !files?.length)}
              onClick={() => submit(input)}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
