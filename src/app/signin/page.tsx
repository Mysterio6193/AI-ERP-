"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Lock, Mail, ShieldCheck, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AdminSigninPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [nextPath, setNextPath] = useState("/")
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    email: "",
    password: "",
  })

  useEffect(() => {
    async function loadState() {
      try {
        if (typeof window !== "undefined") {
          const params = new URLSearchParams(window.location.search)
          setNextPath(params.get("next") || "/")
        }

        const response = await fetch("/api/admin/setup")
        const payload = await response.json()
        const nextNeedsSetup = Boolean(payload.data?.needsSetup)
        setNeedsSetup(nextNeedsSetup)
        if (nextNeedsSetup) {
          router.replace("/setup")
        }
      } catch (requestError) {
        console.error("Failed to load admin setup state", requestError)
      } finally {
        setCheckingSetup(false)
      }
    }

    void loadState()
  }, [router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError("")

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })

      const payload = await response.json()
      if (!response.ok || !payload.success) {
        if (payload.needsSetup) {
          router.replace("/setup")
          return
        }

        setError(payload.error || "Failed to sign in.")
        return
      }

      router.replace(nextPath || "/")
      router.refresh()
    } catch (requestError) {
      console.error("Admin sign-in error", requestError)
      setError("Failed to sign in.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Zap className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">SupplySure OS</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Enterprise Operations & Autonomous ERP</p>
          </div>
        </div>

        <Card className="border border-border bg-card shadow-lg">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl font-semibold tracking-tight">Sign in to your account</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Enter your staff credentials to access the operations dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium">Email address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={form.email}
                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                    placeholder="admin@yourcompany.com"
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium">Password</Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={form.password}
                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                    placeholder="••••••••••••"
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              {error ? (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button type="submit" className="w-full font-medium" disabled={loading || checkingSetup}>
                {loading ? "Signing in..." : "Sign in"}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            <div className="pt-2 text-center text-xs text-muted-foreground">
              {needsSetup ? (
                <Link className="font-medium text-primary hover:underline" href="/setup">
                  Initial setup: Create first admin account →
                </Link>
              ) : (
                <span>
                  Staff accounts are managed by your administrator in <strong className="text-foreground font-medium">Users</strong>.
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
          <span>Encrypted Session & Multi-Tenant Data Isolation</span>
        </div>
      </div>
    </div>
  )
}

