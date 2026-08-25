"use client"

import { useState, useEffect, useRef } from "react"
import {
  Search,
  Plus,
  Mic,
  Send,
  Monitor,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
  Terminal,
  Loader2,
  Maximize2,
  X,
  Layers,
  Bot,
  RefreshCw,
  ExternalLink,
  ChevronRight,
} from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

interface TeammateBot {
  id: string
  name: string
  role: string
  lead: string
  avatarColor: string
  avatarType: "teal_h" | "orange_h" | "purple_poly" | "purple_h" | "blue_h" | "green_factory" | "cyan_truck" | "multi_bubble"
  lastActive: string
  snippet: string
  domain: string
  initialMessages: Array<{
    id: string
    sender: "bot" | "user" | "system"
    text: string
    time?: string
    hasComputerCard?: boolean
    computerCardData?: {
      title: string
      status: "Done" | "Running" | "Waiting"
      description: string
      previewType: "salesforce" | "mrp_factory" | "xero_ledger" | "route_map" | "browser"
    }
  }>
}

const DEFAULT_TEAMMATES: TeammateBot[] = [
  {
    id: "chief",
    name: "Chief",
    role: "Chief of Staff & Operations Orchestrator",
    lead: "Riccardo Moretti",
    avatarColor: "bg-[#2dd4bf]",
    avatarType: "teal_h",
    lastActive: "Yesterday",
    snippet: "booked the venue and sent the c...",
    domain: "Executive Operations",
    initialMessages: [
      {
        id: "c1",
        sender: "bot",
        text: "Morning Riccardo. I've audited the week's operational pulse across Gregory Hills bakery and Sydney logistics. Ready for directives.",
        time: "8:00 am",
      },
      {
        id: "c2",
        sender: "user",
        text: "Give me the Action Priority Matrix for the morning shift and mobilize the factory and accounts bots.",
      },
      {
        id: "c3",
        sender: "system",
        text: "Mobilized Factory Manager and Accounts & Invoicing bots",
      },
      {
        id: "c4",
        sender: "bot",
        text: "Checking operational pulse. Factory dough mixers are running on schedule. Reconciled 14 NAB bank feed deposits.",
        hasComputerCard: true,
        computerCardData: {
          title: "Computer",
          status: "Done",
          description: "Operations Auto-Pilot sweep complete across all 5 RDM departments.",
          previewType: "browser",
        },
      },
    ],
  },
  {
    id: "sales-outbound",
    name: "Sales Outbound",
    role: "Wholesale Pipeline & Outreach Bot",
    lead: "Antonio Russo",
    avatarColor: "bg-[#fb923c]",
    avatarType: "orange_h",
    lastActive: "6:23 am",
    snippet: "Done.",
    domain: "Sales & Pipeline",
    initialMessages: [
      {
        id: "s1",
        sender: "bot",
        text: "Hey Riccardo, good to meet you. What do you want me around for? Anything concrete, or more of a general sidekick?",
        time: "6:22 am",
      },
      {
        id: "s2",
        sender: "user",
        text: "Overnight pipeline generation and outbound.\n\nPick eligible prospects from this Google Sheet, research them on the web, grab context on contacts and accounts from Hex, Sumble, and Salesforce. Draft email and LinkedIn sequences in my voice.",
      },
      {
        id: "s3",
        sender: "system",
        text: "Renamed to Sales Outbound",
      },
      {
        id: "s4",
        sender: "bot",
        text: "Checking what's connected. Hex, Gmail, and LinkedIn are already signed in. Salesforce isn't.",
      },
      {
        id: "s5",
        sender: "bot",
        text: "",
        hasComputerCard: true,
        computerCardData: {
          title: "Computer",
          status: "Done",
          description: "Sign in to Salesforce so I can see the accounts you own.",
          previewType: "salesforce",
        },
      },
    ],
  },
  {
    id: "inbox-manager",
    name: "Inbox Manager",
    role: "Executive Inbox & Triage",
    lead: "Riccardo Moretti",
    avatarColor: "bg-[#6366f1]",
    avatarType: "purple_poly",
    lastActive: "3:22 am",
    snippet: "sent. inbox at zero, 5 drafts park...",
    domain: "Email & Communications",
    initialMessages: [
      {
        id: "i1",
        sender: "bot",
        text: "Triage completed for orders@rdmpizza.com.au. 18 wholesale re-orders routed to warehouse picklists, 2 customer credit applications flagged for review.",
        time: "3:22 am",
      },
    ],
  },
  {
    id: "account-manager",
    name: "Account Manager",
    role: "Customer Success & Retention",
    lead: "Antonio Russo",
    avatarColor: "bg-[#a855f7]",
    avatarType: "purple_h",
    lastActive: "1:22 am",
    snippet: "invite's out to vicky. globex note ...",
    domain: "CRM & Retention",
    initialMessages: [
      {
        id: "a1",
        sender: "bot",
        text: "Audited 18 active wholesale accounts. Fratelli Fresh placed their 12th consecutive weekly order (40 ctns Napoli Rustica). Pizzeria Bella is approaching credit limit ($4,500/$5,000).",
        time: "1:22 am",
      },
    ],
  },
  {
    id: "factory-manager",
    name: "Factory Manager",
    role: "Production & MRP Scheduler",
    lead: "Tony Marchetti",
    avatarColor: "bg-[#10b981]",
    avatarType: "green_factory",
    lastActive: "4:15 am",
    snippet: "BOM exploded for 1,200 cartons...",
    domain: "Manufacturing & MRP",
    initialMessages: [
      {
        id: "f1",
        sender: "bot",
        text: "MRP explosion complete for Gregory Hills Shift A. Spiral Kneader run time estimated at 2.8 hrs. Cold proofing capacity at 82%.",
        time: "4:15 am",
        hasComputerCard: true,
        computerCardData: {
          title: "Computer",
          status: "Done",
          description: "Stone Tunnel Oven & IQF Blast Freezer parameters verified at -35°C.",
          previewType: "mrp_factory",
        },
      },
    ],
  },
  {
    id: "fleet-logistics",
    name: "Fleet & Logistics",
    role: "Route Dispatch & Manifests",
    lead: "Sam Nguyen",
    avatarColor: "bg-[#06b6d4]",
    avatarType: "cyan_truck",
    lastActive: "5:45 am",
    snippet: "Sydney Metro route clustered (12 drops)...",
    domain: "Logistics & Transport",
    initialMessages: [
      {
        id: "l1",
        sender: "bot",
        text: "Generated multi-drop route for Sam Nguyen (Van 1 - Western Sydney & CBD). 12 customer drop-offs scheduled between 7:30 AM and 1:45 PM.",
        time: "5:45 am",
        hasComputerCard: true,
        computerCardData: {
          title: "Computer",
          status: "Done",
          description: "Sydney route cluster map optimized with live traffic offset.",
          previewType: "route_map",
        },
      },
    ],
  },
  {
    id: "talent-scout",
    name: "Talent Scout",
    role: "Recruitment & Onboarding",
    lead: "Riccardo Moretti",
    avatarColor: "bg-[#3b82f6]",
    avatarType: "blue_h",
    lastActive: "Yesterday",
    snippet: "3 intros drafted in your voice, hel...",
    domain: "People & HR",
    initialMessages: [
      {
        id: "t1",
        sender: "bot",
        text: "Reviewed 6 applicant profiles for Gregory Hills Head Bakery Shift Supervisor. Top 2 candidates shortlisted for interview.",
        time: "Yesterday",
      },
    ],
  },
  {
    id: "expense-manager",
    name: "Expense Manager",
    role: "Xero AP & Receipts",
    lead: "Maria Esposito",
    avatarColor: "bg-[#f97316]",
    avatarType: "orange_h",
    lastActive: "2:22 am",
    snippet: "report filed. 9 receipts, nothing o...",
    domain: "Finance & Accounts",
    initialMessages: [
      {
        id: "e1",
        sender: "bot",
        text: "Matched 9 supplier invoices from Manildra Group and carton packaging suppliers. 2-way Xero invoice sync completed.",
        time: "2:22 am",
      },
    ],
  },
  {
    id: "offsite-crew",
    name: "Offsite crew",
    role: "Cross-Functional Swarm",
    lead: "All Leads",
    avatarColor: "bg-[#8b5cf6]",
    avatarType: "multi_bubble",
    lastActive: "12:22 am",
    snippet: "that leaves the pipeline. i'd spin ...",
    domain: "Multi-Agent Swarm",
    initialMessages: [
      {
        id: "o1",
        sender: "bot",
        text: "Offsite crew swarm synced across Sales, Warehouse, and Accounts. All departments operating within weekly SLA targets.",
        time: "12:22 am",
      },
    ],
  },
]

export default function GrokBotExactPage() {
  const [teammates, setTeammates] = useState<TeammateBot[]>(DEFAULT_TEAMMATES)
  const [activeBotId, setActiveBotId] = useState<string>("sales-outbound")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [inputMessage, setInputMessage] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(false)
  const [isNewBotOpen, setIsNewBotOpen] = useState<boolean>(false)
  const [newBotName, setNewBotName] = useState<string>("")
  const [newBotRole, setNewBotRole] = useState<string>("")
  const [isVirtualComputerOpen, setIsVirtualComputerOpen] = useState<boolean>(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const activeBot = teammates.find((b) => b.id === activeBotId) || teammates[0]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeBot?.initialMessages, loading])

  const filteredTeammates = teammates.filter((bot) =>
    bot.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bot.role.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || loading) return

    const userText = inputMessage.trim()
    setInputMessage("")

    // Add user message immediately
    const userMsgId = `user_${Date.now()}`
    const updatedMessages = [
      ...activeBot.initialMessages,
      {
        id: userMsgId,
        sender: "user" as const,
        text: userText,
      },
    ]

    setTeammates((prev) =>
      prev.map((b) =>
        b.id === activeBot.id ? { ...b, initialMessages: updatedMessages, snippet: userText.slice(0, 32) + "..." } : b
      )
    )

    setLoading(true)

    try {
      // Execute via Grok Bot API / Think Engine
      const res = await fetch("/api/grok-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "think_reasoning",
          payload: { question: userText, domain: "general" },
        }),
      })

      const data = await res.json()
      const botResponseText = data.verdict || `Understood. I am executing this task across RDM Pizza Australia systems.`

      const botMsgId = `bot_${Date.now()}`
      const finalMessages = [
        ...updatedMessages,
        {
          id: botMsgId,
          sender: "bot" as const,
          text: botResponseText,
          hasComputerCard: true,
          computerCardData: {
            title: "Computer",
            status: "Done" as const,
            description: data.reasoningSteps?.[1]?.analysis || "Audited ERP database records and synchronized background workflows.",
            previewType: "browser" as const,
          },
        },
      ]

      setTeammates((prev) =>
        prev.map((b) =>
          b.id === activeBot.id ? { ...b, initialMessages: finalMessages, snippet: "Done." } : b
        )
      )
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateNewBot = () => {
    if (!newBotName.trim()) return

    const newBot: TeammateBot = {
      id: `bot_${Date.now()}`,
      name: newBotName.trim(),
      role: newBotRole.trim() || "Autonomous Specialist",
      lead: "Riccardo Moretti",
      avatarColor: "bg-[#06b6d4]",
      avatarType: "teal_h",
      lastActive: "Just now",
      snippet: "Ready for tasks...",
      domain: "Operations",
      initialMessages: [
        {
          id: "init",
          sender: "bot",
          text: `Hey Riccardo, I am ${newBotName.trim()}. I have full access to RDM Pizza Australia ERP data and cloud tools. What should I tackle first?`,
          time: "Just now",
        },
      ],
    }

    setTeammates((prev) => [newBot, ...prev])
    setActiveBotId(newBot.id)
    setNewBotName("")
    setNewBotRole("")
    setIsNewBotOpen(false)
  }

  // Render Bot Icon Glyph matching screenshot style
  const renderBotAvatar = (bot: TeammateBot) => {
    if (bot.avatarType === "purple_poly") {
      return (
        <div className="relative w-8 h-8 rounded-full bg-[#1e1b4b] flex items-center justify-center border border-indigo-500/30">
          <div className="w-4 h-4 bg-gradient-to-tr from-[#4f46e5] to-[#818cf8] rotate-45 rounded-[3px] flex items-center justify-center">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 -mt-1 -mr-1" />
          </div>
        </div>
      )
    }

    if (bot.avatarType === "multi_bubble") {
      return (
        <div className="relative w-8 h-8 rounded-full bg-[#2e1065] flex items-center justify-center border border-purple-500/30">
          <span className="w-3.5 h-3.5 rounded-full bg-[#a855f7] -ml-1 inline-block" />
          <span className="w-3.5 h-3.5 rounded-full bg-[#2dd4bf] -mr-1 -mt-1 inline-block opacity-90" />
        </div>
      )
    }

    return (
      <div
        className={`w-8 h-8 rounded-full ${bot.avatarColor} flex items-center justify-center text-zinc-950 font-bold text-xs shadow-inner`}
      >
        <span className="text-[13px] tracking-tighter font-extrabold select-none">
          {bot.avatarType === "green_factory" ? "🏭" : bot.avatarType === "cyan_truck" ? "🚚" : "八"}
        </span>
      </div>
    )
  }

  return (
    <div className="flex justify-center items-center p-2 md:p-6 min-h-[calc(100vh-4rem)] bg-[#0c0c0e]">
      {/* ── macOS App Window Container ── */}
      <div className="w-full max-w-[1240px] h-[840px] bg-[#141416] border border-[#26262a] rounded-[24px] shadow-2xl overflow-hidden flex flex-col md:flex-row text-zinc-100 antialiased font-sans">
        
        {/* ── LEFT SIDEBAR (Teammates & Bots) ── */}
        <div className="w-full md:w-[320px] bg-[#17171a] border-r border-[#26262a] flex flex-col justify-between shrink-0 select-none">
          
          {/* Top Titlebar & Controls */}
          <div className="p-4 pb-2 space-y-4">
            {/* macOS Traffic Lights + Add Button */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] inline-block cursor-pointer" />
                <span className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123] inline-block cursor-pointer" />
                <span className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] inline-block cursor-pointer" />
              </div>
              <button
                onClick={() => setIsNewBotOpen(true)}
                className="text-zinc-400 hover:text-zinc-100 p-1 rounded-md hover:bg-[#26262a] transition-colors"
                title="Create New Bot"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#222226] text-xs text-zinc-200 pl-9 pr-3 py-2 rounded-xl border border-transparent focus:border-zinc-700 focus:outline-none placeholder-zinc-500 transition-all"
              />
            </div>
          </div>

          {/* Bots & Teammates List */}
          <div className="flex-1 overflow-y-auto px-2 space-y-0.5 scrollbar-thin scrollbar-thumb-zinc-800">
            {filteredTeammates.map((bot) => {
              const isActive = bot.id === activeBot.id
              return (
                <button
                  key={bot.id}
                  onClick={() => setActiveBotId(bot.id)}
                  className={`w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all ${
                    isActive
                      ? "bg-[#27272c] text-white shadow-sm"
                      : "hover:bg-[#1f1f23] text-zinc-300"
                  }`}
                >
                  {/* Bot Avatar */}
                  <div className="shrink-0">{renderBotAvatar(bot)}</div>

                  {/* Bot Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold tracking-tight truncate text-zinc-100">
                        {bot.name}
                      </span>
                      <span className="text-[11px] text-zinc-500 shrink-0 font-normal">
                        {bot.lastActive}
                      </span>
                    </div>
                    <p className="text-[12px] text-zinc-400 truncate mt-0.5 font-normal">
                      {bot.snippet}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Bottom Current User Profile */}
          <div className="p-3 border-t border-[#242428] flex items-center gap-3 bg-[#17171a]">
            <div className="w-7 h-7 rounded-full bg-[#2a2a2f] border border-zinc-700/60 flex items-center justify-center text-[11px] font-bold text-zinc-300">
              RM
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[13px] font-medium text-zinc-200 truncate block">
                Riccardo Moretti
              </span>
            </div>
          </div>
        </div>

        {/* ── RIGHT MAIN WORKSPACE & CHAT PANE ── */}
        <div className="flex-1 bg-[#121214] flex flex-col justify-between overflow-hidden relative">
          
          {/* Header Bar */}
          <div className="px-6 py-4 border-b border-[#202024] flex items-center justify-between bg-[#141416]/80 backdrop-blur-md z-10 select-none">
            <div className="flex items-center gap-2.5">
              {renderBotAvatar(activeBot)}
              <span className="font-semibold text-sm tracking-tight text-white">
                {activeBot.name}
              </span>
            </div>

            {/* Virtual Computer / Monitor View Toggle */}
            <button
              onClick={() => setIsVirtualComputerOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 p-2 rounded-lg hover:bg-[#202024] transition-colors flex items-center gap-1.5 text-xs"
              title="Open Virtual Computer Workspace"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>

          {/* Conversation Stream */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin scrollbar-thumb-zinc-800">
            {/* Timestamp Header */}
            <div className="text-center">
              <span className="text-[11px] text-zinc-500 font-medium">6:22 am</span>
            </div>

            {activeBot.initialMessages.map((msg) => {
              if (msg.sender === "system") {
                return (
                  <div key={msg.id} className="text-center my-3">
                    <span className="text-[12px] text-zinc-500 font-normal">
                      {msg.text}
                    </span>
                  </div>
                )
              }

              if (msg.sender === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[78%] bg-[#f4f4f5] text-zinc-900 rounded-[20px] rounded-tr-[4px] px-4 py-3 text-[14px] leading-relaxed font-normal shadow-md whitespace-pre-line">
                      {msg.text}
                    </div>
                  </div>
                )
              }

              // Bot Message
              return (
                <div key={msg.id} className="flex flex-col items-start space-y-3 max-w-[85%]">
                  {msg.text && (
                    <div className="bg-[#222226] text-zinc-200 rounded-[20px] rounded-tl-[4px] px-4 py-3 text-[14px] leading-relaxed font-normal shadow-sm border border-[#2b2b30]/40">
                      {msg.text}
                    </div>
                  )}

                  {/* "Computer" Virtual Agent Card matching exact screenshot */}
                  {msg.hasComputerCard && msg.computerCardData && (
                    <div className="w-full max-w-[480px] bg-[#1a1a1e] border border-[#2d2d34] rounded-[18px] p-4 shadow-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-300 tracking-tight">
                          {msg.computerCardData.title}
                        </span>
                        <Badge className="bg-[#10b981]/10 text-[#34d399] border-transparent text-[11px] font-medium px-2 py-0.5 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-pulse" />
                          Done
                        </Badge>
                      </div>

                      <p className="text-[13px] text-zinc-400 font-normal">
                        {msg.computerCardData.description}
                      </p>

                      {/* Mockup Virtual Cloud Desktop Preview matching screenshot */}
                      <div
                        onClick={() => setIsVirtualComputerOpen(true)}
                        className="relative rounded-[12px] overflow-hidden border border-[#34343d] bg-gradient-to-br from-[#854d0e]/40 via-[#1c1917] to-[#0c0a09] h-[170px] cursor-pointer group shadow-inner flex items-center justify-center p-3"
                      >
                        {/* Browser Window Mockup */}
                        <div className="w-full h-full bg-[#16161a]/95 rounded-lg border border-zinc-700/60 p-3 flex flex-col justify-between shadow-2xl">
                          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-zinc-600" />
                              <span className="w-2 h-2 rounded-full bg-zinc-600" />
                              <span className="w-2 h-2 rounded-full bg-zinc-600" />
                            </div>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              app.rdmpizza.com.au / {activeBot.domain.toLowerCase()}
                            </span>
                            <span className="text-[10px] text-emerald-400 font-medium">● Live</span>
                          </div>

                          <div className="space-y-1.5 my-auto">
                            <div className="flex items-center justify-between text-[11px] text-zinc-300 font-medium">
                              <span>Outreach queue / MRP Live Batch</span>
                              <span className="text-zinc-500 text-[10px]">Draft</span>
                            </div>
                            <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 w-[78%]" />
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-zinc-400">
                            <span>Synced 40 ctns • Gregory Hills Hub</span>
                            <span className="group-hover:text-amber-400 flex items-center gap-1 transition-colors">
                              Inspect <ExternalLink className="w-2.5 h-2.5" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {loading && (
              <div className="flex items-center gap-2 text-zinc-400 bg-[#222226] px-4 py-2.5 rounded-full w-fit border border-zinc-800">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                <span className="text-xs">{activeBot.name} is thinking & executing...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── BOTTOM INPUT BAR (Floating Capsule) ── */}
          <div className="p-4 pt-2">
            <div className="max-w-[780px] mx-auto bg-[#1c1c20] border border-[#2e2e34] rounded-full px-3 py-2 flex items-center gap-2 shadow-2xl focus-within:border-zinc-600 transition-colors">
              {/* Add / Attachment Button */}
              <button
                onClick={() => setIsNewBotOpen(true)}
                className="w-8 h-8 rounded-full bg-[#27272c] hover:bg-[#323238] text-zinc-300 flex items-center justify-center transition-colors shrink-0"
                title="Add Agent / Tools"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Text Input */}
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                placeholder={`Message ${activeBot.name}`}
                className="flex-1 bg-transparent text-[13px] text-zinc-100 placeholder-zinc-500 focus:outline-none px-2"
              />

              {/* Voice / Mic Button */}
              <button
                onClick={handleSendMessage}
                disabled={loading}
                className="w-8 h-8 rounded-full bg-zinc-200 hover:bg-white text-zinc-950 flex items-center justify-center transition-all shrink-0 shadow"
                title={inputMessage.trim() ? "Send Message" : "Voice Input"}
              >
                {inputMessage.trim() ? (
                  <Send className="w-3.5 h-3.5 fill-current ml-0.5" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL 1: CREATE NEW BOT / TEAMMATE ── */}
      <Dialog open={isNewBotOpen} onOpenChange={setIsNewBotOpen}>
        <DialogContent className="bg-[#18181b] border-zinc-800 text-zinc-100 max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center gap-2 text-white">
              <Bot className="w-5 h-5 text-amber-400" />
              Deploy Autonomous Teammate Bot
            </DialogTitle>
            <DialogDescription className="text-zinc-400 text-xs">
              Add a new persistent agent teammate to the RDM Pizza Australia cloud workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Bot Name</label>
              <Input
                value={newBotName}
                onChange={(e) => setNewBotName(e.target.value)}
                placeholder="e.g. Sourdough QA Auditor, Melbourne Expansion Rep"
                className="bg-[#242428] border-zinc-700 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-300">Mission & Role</label>
              <Input
                value={newBotRole}
                onChange={(e) => setNewBotRole(e.target.value)}
                placeholder="e.g. Audits fermentation hours and flour supplier invoices"
                className="bg-[#242428] border-zinc-700 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsNewBotOpen(false)}
              className="border-zinc-700 text-zinc-300 text-xs"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateNewBot}
              className="bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs"
            >
              Deploy Teammate
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL 2: VIRTUAL COMPUTER ENVIRONMENT VIEW ── */}
      <Dialog open={isVirtualComputerOpen} onOpenChange={setIsVirtualComputerOpen}>
        <DialogContent className="bg-[#121214] border-zinc-800 text-zinc-100 max-w-4xl h-[620px] rounded-2xl flex flex-col p-0 overflow-hidden">
          {/* Virtual Titlebar */}
          <div className="bg-[#18181b] px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              <span className="w-3 h-3 rounded-full bg-yellow-500 inline-block" />
              <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
              <span className="text-xs font-mono text-zinc-400 ml-2">
                grok-cloud-vm://rdm-sydney-node-01.internal
              </span>
            </div>
            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs">
              Autonomous Cloud Execution
            </Badge>
          </div>

          {/* Virtual Desktop Display */}
          <div className="flex-1 bg-gradient-to-br from-[#1c1917] via-[#0f0f11] to-[#000] p-6 flex flex-col justify-between font-mono">
            <div className="space-y-3 bg-[#18181b]/90 border border-zinc-800 p-4 rounded-xl text-xs">
              <div className="text-emerald-400 flex items-center gap-2">
                <Terminal className="w-4 h-4" />
                <span>RDM Pizza Australia Cloud Agent Node • Connected</span>
              </div>
              <div className="text-zinc-400 space-y-1">
                <p>❯ Signed in: Xero Accounting API (2-way live sync)</p>
                <p>❯ Signed in: Telegram Dispatch Bot (@SupplySureOSBot)</p>
                <p>❯ Signed in: Gregory Hills Stone Deck Oven & Blast Freezer Telemetry</p>
                <p className="text-amber-400">❯ Active Mission: {activeBot.role}</p>
              </div>
            </div>

            <div className="bg-[#18181b]/80 border border-zinc-800 p-4 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-zinc-300">
                  {activeBot.name} is running in background. Session persists when closed.
                </span>
              </div>
              <Button
                size="sm"
                onClick={() => setIsVirtualComputerOpen(false)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs"
              >
                Back to Chat
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
