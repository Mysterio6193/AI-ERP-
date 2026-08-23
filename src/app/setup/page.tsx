"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Bot, Building2, CheckCircle2, ShieldCheck, Sparkles, User, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NAME_SUGGESTIONS } from "@/lib/agent/identity-shared"

export default function AdminSetupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [checkingState, setCheckingState] = useState(true)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    companyName: "",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    agentName: "",
  })

  useEffect(() => {
    async function loadState() {
      try {
        const response = await fetch("/api/admin/setup")
        const payload = await response.json()
        if (!payload.data?.needsSetup) {
          router.replace("/signin")
        }
      } catch (requestError) {
        console.error("Failed to load setup state", requestError)
      } finally {
        setCheckingState(false)
      }
    }

    void loadState()
  }, [router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const payload = await response.json()

      if (!response.ok || !payload.success) {
        setError(payload.error || "Failed to create admin account.")
        return
      }

      router.replace("/")
      router.refresh()
    } catch (requestError) {
      console.error("Admin setup error", requestError)
      setError("Failed to create admin account.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="relative w-full max-w-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">SupplySure OS Initial Setup</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Create the root organization admin account to bring your autonomous ERP online.
            </p>
          </div>
        </div>

        <Card className="border border-border bg-card shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold tracking-tight">Organization & Master Admin</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Configure your primary company identity and administrator login credentials.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-xs font-medium">Business / Organization name</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="companyName"
                      value={form.companyName}
                      onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                      placeholder="Acme Foods & Logistics Pty Ltd"
                      className="pl-9 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-xs font-medium">Administrator full name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Alex Morgan"
                        className="pl-9 text-sm"
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs font-medium">Work email address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                      placeholder="alex@acmefoods.com"
                      className="text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={form.password}
                      onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                      placeholder="Min. 8 characters"
                      className="text-sm"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-xs font-medium">Confirm password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={form.confirmPassword}
                      onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                      placeholder="Repeat password"
                      className="text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <Label htmlFor="agentName" className="text-xs font-semibold text-foreground">
                      Name your AI operations assistant
                    </Label>
                  </div>
                  <Input
                    id="agentName"
                    value={form.agentName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, agentName: event.target.value }))
                    }
                    placeholder="e.g. Atlas, Nova, Cooper (leave blank to decide later)"
                    className="text-sm bg-background"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3 text-amber-500" /> Suggestions:
                    </span>
                    {NAME_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="rounded-full border border-border bg-background px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        onClick={() => setForm((current) => ({ ...current, agentName: suggestion }))}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Staff will interact with it by this name. The agent always identifies itself as an AI assistant with mandatory outbound disclosures.
                  </p>
                </div>
              </div>

              {error ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Additional staff users can be invited later from the Users module.
                </p>
                <Button type="submit" disabled={loading || checkingState}>
                  {loading ? "Initializing..." : "Complete Setup & Launch"}
                  {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Production Ready · Full Tenant Encryption</span>
        </div>
      </div>
    </div>
  )
}

