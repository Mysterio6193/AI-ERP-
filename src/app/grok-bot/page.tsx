"use client"

import { useState, useEffect } from "react"
import {
  Brain,
  Sparkles,
  Zap,
  Radio,
  Users,
  Play,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  Workflow,
  Terminal,
  Cpu,
  Layers,
  Search,
  ShieldCheck,
  Send,
  Loader2,
  RefreshCw,
  Target,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export default function GrokBotPage() {
  const [activeTab, setActiveTab] = useState("think_mode")
  const [loading, setLoading] = useState(false)
  const [thinkQuestion, setThinkQuestion] = useState(
    "Should RDM Pizza Australia launch a dedicated 100% gluten-free certified base line for foodservice?"
  )
  const [thinkResult, setThinkResult] = useState<any>(null)

  // Chief of Staff state
  const [cosMission, setCosMission] = useState(
    "Mobilize all department specialist bots to prepare for Friday Sydney CBD delivery surge and audit weekly cashflow."
  )
  const [cosResult, setCosResult] = useState<any>(null)

  // Market radar state
  const [radarCategory, setRadarCategory] = useState("pizza_crust_trends")
  const [radarResult, setRadarResult] = useState<any>(null)

  // Macro state
  const [macroName, setMacroName] = useState("Friday Afternoon Order Cutoff & Dispatch Handover")
  const [macroSteps, setMacroSteps] = useState(
    "1. Verify cold room temperatures in Bay D1 are at -18°C\n2. Check picklists have verified HACCP lot codes attached\n3. Dispatch delivery manifests to Sam Nguyen on driver app\n4. Push live fulfillment sync to Shopify and Xero"
  )
  const [macroResult, setMacroResult] = useState<any>(null)

  // Auto-Pilot state
  const [autoPilotResult, setAutoPilotResult] = useState<any>(null)

  // Initial load
  useEffect(() => {
    runMarketRadar("pizza_crust_trends")
  }, [])

  const runThinkReasoning = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/grok-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "think_reasoning",
          payload: { question: thinkQuestion, domain: "pricing_margins" },
        }),
      })
      const data = await res.json()
      setThinkResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const runChiefOfStaff = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/grok-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "chief_of_staff_mobilize",
          payload: { mission: cosMission },
        }),
      })
      const data = await res.json()
      setCosResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const runMarketRadar = async (category: string) => {
    setRadarCategory(category)
    setLoading(true)
    try {
      const res = await fetch("/api/grok-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "market_trend_radar",
          payload: { category },
        }),
      })
      const data = await res.json()
      setRadarResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const runMacroExecution = async () => {
    setLoading(true)
    try {
      const stepsArray = macroSteps.split("\n").map((s) => s.replace(/^\d+\.\s*/, "").trim()).filter(Boolean)
      const res = await fetch("/api/grok-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "execute_macro",
          payload: {
            name: macroName,
            description: "Custom demonstrated operational workflow",
            trigger: "manual",
            steps: stepsArray,
          },
        }),
      })
      const data = await res.json()
      setMacroResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const runAutoPilotSweep = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/grok-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "autopilot_sweep", payload: {} }),
      })
      const data = await res.json()
      setAutoPilotResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gradient-to-r from-zinc-950 via-slate-900 to-zinc-900 border border-zinc-800 p-6 rounded-2xl shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl border border-white/20">
              <Zap className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-white tracking-tight">Grok Bot Studio</h1>
                <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-xs">
                  xAI Agent Platform
                </Badge>
              </div>
              <p className="text-sm text-zinc-400">
                Autonomous Teammates Workspace, Think-Mode Deep Reasoner & Real-Time Foodservice Intelligence
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-3 py-1 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse mr-2 inline-block" />
            Grok-3 Ground Truth: Active
          </Badge>
          <Button
            size="sm"
            onClick={runAutoPilotSweep}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Auto-Pilot Sweep
          </Button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 bg-zinc-900/80 border border-zinc-800 p-1 rounded-xl">
          <TabsTrigger value="think_mode" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
            <Brain className="h-4 w-4 mr-2 text-indigo-400" />
            Think Mode (Deep Reasoner)
          </TabsTrigger>
          <TabsTrigger value="chief_of_staff" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
            <Users className="h-4 w-4 mr-2 text-blue-400" />
            Chief of Staff (Teammates)
          </TabsTrigger>
          <TabsTrigger value="market_radar" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
            <Radio className="h-4 w-4 mr-2 text-emerald-400" />
            Market Trend Radar
          </TabsTrigger>
          <TabsTrigger value="workflow_macros" className="data-[state=active]:bg-zinc-800 data-[state=active]:text-white">
            <Workflow className="h-4 w-4 mr-2 text-amber-400" />
            Workflow Macros
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: THINK MODE DEEP REASONER ── */}
        <TabsContent value="think_mode" className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Brain className="h-5 w-5 text-indigo-400" />
                    Truth-Seeking "Think" Mode Engine
                  </CardTitle>
                  <CardDescription>
                    Breaks multi-dimensional operational questions into explicit, auditable reasoning steps anchored in live ERP ground truth.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="border-indigo-500/30 text-indigo-400 bg-indigo-500/10">
                  Step-by-Step Chain of Thought
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Strategic Business Query
                </label>
                <div className="flex gap-3">
                  <Input
                    value={thinkQuestion}
                    onChange={(e) => setThinkQuestion(e.target.value)}
                    placeholder="Enter a strategic dilemma or operational question..."
                    className="bg-zinc-950 border-zinc-800 text-zinc-100"
                  />
                  <Button
                    onClick={runThinkReasoning}
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white min-w-[140px]"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Think & Audit
                  </Button>
                </div>
              </div>

              {/* Sample Quick Questions */}
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="text-xs text-zinc-400 self-center">Try queries:</span>
                {[
                  "Should we launch a gluten-free pizza base line?",
                  "How to recover $2,850 overdue from Fat Boyz without losing them?",
                  "What if flour prices jump 15% next month?",
                ].map((q, idx) => (
                  <button
                    key={idx}
                    onClick={() => setThinkQuestion(q)}
                    className="text-xs bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md border border-zinc-700/50 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Result Chain of Thought Display */}
              {thinkResult && (
                <div className="mt-6 space-y-4 border border-zinc-800 bg-zinc-950/80 p-5 rounded-xl">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-5 w-5 text-emerald-400" />
                      <span className="text-sm font-medium text-zinc-200">Grok Reasoning Verification</span>
                    </div>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                      Confidence: {thinkResult.confidenceScore || "96.4%"}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    {thinkResult.reasoningSteps?.map((step: any, idx: number) => (
                      <div key={idx} className="bg-zinc-900/60 border border-zinc-800/80 p-3.5 rounded-lg space-y-1">
                        <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                          {step.step}
                        </div>
                        <p className="text-sm text-zinc-300 leading-relaxed">{step.analysis}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 p-3.5 bg-emerald-950/30 border border-emerald-800/40 rounded-lg flex items-start gap-3">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Final Strategic Verdict:</span>
                      <p className="text-sm text-emerald-200 mt-0.5">{thinkResult.verdict}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2: CHIEF OF STAFF & TEAMMATES ROSTER ── */}
        <TabsContent value="chief_of_staff" className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-400" />
                    Autonomous Teammates Workspace
                  </CardTitle>
                  <CardDescription>
                    Roster of specialized autonomous bots executing persistent parallel workflows across RDM departments.
                  </CardDescription>
                </div>
                <Button
                  onClick={runChiefOfStaff}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                  Mobilize All Bots
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Executive Mission Directive
                </label>
                <Textarea
                  value={cosMission}
                  onChange={(e) => setCosMission(e.target.value)}
                  rows={2}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100"
                />
              </div>

              {/* Bot Teammates Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  {
                    bot: "Chief of Staff Bot",
                    lead: "Riccardo Moretti",
                    domain: "Management & Strategy",
                    status: "Coordinating Roster",
                    badgeColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
                    task: "Synthesizing cross-team roadmap & SLA compliance.",
                  },
                  {
                    bot: "Sales Rep Bot",
                    lead: "Antonio Russo",
                    domain: "Sales & CRM",
                    status: "Active (20 Accounts Audited)",
                    badgeColor: "text-blue-400 border-blue-500/30 bg-blue-500/10",
                    task: "Tracking pipeline velocity and lapsed pizzeria re-orders.",
                  },
                  {
                    bot: "Factory Manager Bot",
                    lead: "Tony Marchetti",
                    domain: "Production & MRP",
                    status: "Line 1 Active",
                    badgeColor: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
                    task: "BOM explosions & dough fermentation capacity scheduling.",
                  },
                  {
                    bot: "Accounts & Cashflow Bot",
                    lead: "Maria Esposito",
                    domain: "Finance & Tax",
                    status: "Reconciling Feeds",
                    badgeColor: "text-purple-400 border-purple-500/30 bg-purple-500/10",
                    task: "2-way Xero sync & automatic bank statement matching.",
                  },
                  {
                    bot: "Fleet Logistics Bot",
                    lead: "Sam Nguyen",
                    domain: "Delivery & Transport",
                    status: "Route Clustered",
                    badgeColor: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
                    task: "Dispatching multi-drop route manifests to driver app.",
                  },
                  {
                    bot: "QA & Compliance Bot",
                    lead: "Tony Marchetti",
                    domain: "HACCP & FSANZ",
                    status: "100% Certified",
                    badgeColor: "text-rose-400 border-rose-500/30 bg-rose-500/10",
                    task: "Auditing oven core pathogen kill temps & metal detectors.",
                  },
                ].map((bot, idx) => (
                  <div key={idx} className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm text-white">{bot.bot}</div>
                      <Badge variant="outline" className={`text-xs ${bot.badgeColor}`}>
                        {bot.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-zinc-400">
                      Lead: <span className="text-zinc-200">{bot.lead}</span> • {bot.domain}
                    </div>
                    <div className="text-xs text-zinc-300 bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800">
                      👉 {bot.task}
                    </div>
                  </div>
                ))}
              </div>

              {cosResult && (
                <Alert className="bg-blue-950/30 border-blue-800/40 text-blue-200">
                  <CheckCircle2 className="h-4 w-4 text-blue-400" />
                  <AlertTitle className="text-sm font-semibold">Chief of Staff Directive Dispatched</AlertTitle>
                  <AlertDescription className="text-xs mt-1">
                    {cosResult.summary}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 3: MARKET TREND RADAR ── */}
        <TabsContent value="market_radar" className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Radio className="h-5 w-5 text-emerald-400" />
                    Live Foodservice & Dining Trend Radar
                  </CardTitle>
                  <CardDescription>
                    Real-time market intelligence on consumer pizza preferences, commodity ingredients, and Australian competitor pricing.
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {[
                    { id: "pizza_crust_trends", label: "Crust Trends" },
                    { id: "ingredient_costs", label: "Commodities" },
                    { id: "competitor_pricing", label: "Competitors" },
                    { id: "hospitality_industry_news", label: "News" },
                  ].map((cat) => (
                    <Button
                      key={cat.id}
                      size="sm"
                      variant={radarCategory === cat.id ? "default" : "outline"}
                      onClick={() => runMarketRadar(cat.id)}
                      className={radarCategory === cat.id ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "border-zinc-700 text-zinc-300"}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {radarResult && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Array.isArray(radarResult.marketIntelligence) &&
                    radarResult.marketIntelligence.map((item: any, idx: number) => (
                      <div key={idx} className="p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-white">{item.trend || item.item || item.competitor || item.headline}</span>
                          {item.momentum && (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs">
                              {item.momentum}
                            </Badge>
                          )}
                          {item.avgPricePerCarton && (
                            <Badge className="bg-blue-500/10 text-blue-400 border border-blue-500/30 text-xs">
                              {item.avgPricePerCarton}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                          {item.impact || item.trend || item.rdmPriceAdvantage || item.summary}
                        </p>
                      </div>
                    ))}
                </div>
              )}

              {radarResult?.strategicTakeaway && (
                <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-xl flex items-start gap-3 mt-4">
                  <TrendingUp className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wide">Strategic Recommendation:</span>
                    <p className="text-sm text-emerald-200 mt-0.5">{radarResult.strategicTakeaway}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 4: NO-CODE WORKFLOW MACROS ── */}
        <TabsContent value="workflow_macros" className="space-y-6">
          <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Workflow className="h-5 w-5 text-amber-400" />
                    No-Code Workflow Macro Studio
                  </CardTitle>
                  <CardDescription>
                    Teach the agent new business procedures using plain language demonstration steps. Compiles into persistent automated macros.
                  </CardDescription>
                </div>
                <Button
                  onClick={runMacroExecution}
                  disabled={loading}
                  className="bg-amber-600 hover:bg-amber-500 text-white"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                  Compile & Save Macro
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Macro Name</label>
                <Input
                  value={macroName}
                  onChange={(e) => setMacroName(e.target.value)}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                  Demonstrated Workflow Steps (One per line)
                </label>
                <Textarea
                  value={macroSteps}
                  onChange={(e) => setMacroSteps(e.target.value)}
                  rows={5}
                  className="bg-zinc-950 border-zinc-800 text-zinc-100 font-mono text-xs"
                />
              </div>

              {macroResult && (
                <div className="mt-4 p-4 bg-zinc-950 border border-zinc-800 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <span className="text-sm font-semibold text-amber-400">{macroResult.macroName}</span>
                    <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs">
                      {macroResult.status}
                    </Badge>
                  </div>
                  <div className="space-y-1.5 font-mono text-xs text-zinc-300">
                    {macroResult.macroSteps?.map((s: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-400 pt-2 border-t border-zinc-800">{macroResult.message}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Auto-Pilot Action Priority Matrix (Shown if loaded) */}
      {autoPilotResult && (
        <Card className="border-zinc-800 bg-zinc-950">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2 text-zinc-200">
                <Target className="h-5 w-5 text-amber-400" />
                Operations Auto-Pilot Action Matrix
              </CardTitle>
              <Badge variant="outline" className="text-zinc-400 text-xs">
                Updated: {new Date(autoPilotResult.sweepTimestamp).toLocaleTimeString()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-2">
              <span className="text-xs font-bold text-emerald-400 uppercase">⚡ Quick Wins (High Impact / Low Effort)</span>
              {autoPilotResult.actionPriorityMatrix?.quadrant1_quickWins?.map((item: any, i: number) => (
                <div key={i} className="text-xs text-zinc-300 bg-zinc-900/80 p-2 rounded border border-zinc-800">
                  {item.task}
                </div>
              ))}
            </div>

            <div className="p-3.5 bg-blue-950/20 border border-blue-800/40 rounded-xl space-y-2">
              <span className="text-xs font-bold text-blue-400 uppercase">🎯 Strategic Priorities (High Impact)</span>
              {autoPilotResult.actionPriorityMatrix?.quadrant2_strategicPriorities?.map((item: any, i: number) => (
                <div key={i} className="text-xs text-zinc-300 bg-zinc-900/80 p-2 rounded border border-zinc-800">
                  {item.task}
                </div>
              ))}
            </div>

            <div className="p-3.5 bg-purple-950/20 border border-purple-800/40 rounded-xl space-y-2">
              <span className="text-xs font-bold text-purple-400 uppercase">🛡️ Risk Mitigations</span>
              {autoPilotResult.actionPriorityMatrix?.quadrant3_riskMitigations?.map((item: any, i: number) => (
                <div key={i} className="text-xs text-zinc-300 bg-zinc-900/80 p-2 rounded border border-zinc-800">
                  {item.task}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
