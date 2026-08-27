"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AdminSigninPage() {
  // Read from the URL directly rather than useSearchParams, which would need a
  // Suspense boundary around a page that is otherwise entirely static.
  const expired =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("reason") === "expired"

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
      // A network failure and a wrong password are different problems, and
      // telling someone their details are wrong when the server is
      // unreachable sends them looking in the wrong place.
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <div className="apple-eyebrow">SupplySure OS</div>
          <div className="max-w-2xl space-y-4">
            {/*
              Says what the system is for, not what it is like. The previous
              copy sold a "clarity"-forward "Apple-inspired control surface" to
              people who already work here and are trying to sign in — nobody
              reading this screen is deciding whether to buy it.
            */}
            <h1 className="text-[40px] font-semibold tracking-[-0.04em] text-white md:text-[56px]">
              Orders, stock, deliveries and invoices.
            </h1>
            <p className="max-w-xl text-[17px] text-white/72">
              Sign in to place and track orders, check stock, plan runs and manage what customers
              owe.
            </p>
          </div>
        </div>
        <Card className="w-full max-w-md justify-self-end bg-white text-[#1d1d1f]">
          <CardHeader className="space-y-2">
            <CardTitle as="h2" className="text-[32px]">Sign in</CardTitle>
            <CardDescription>
              Use your staff account to access the admin dashboard and live operating modules.
            </CardDescription>

            {/*
              Says why they are here. Being bounced to a login with no
              explanation reads as the app losing your work, when in fact the
              session simply ended.
            */}
            {expired ? (
              <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                Your session has ended, so you were signed out. Sign in again to carry on where you
                left off.
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="admin@yourcompany.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Enter your password"
              />
            </div>
            {error ? (
              // role="alert" so a screen reader announces the failure. Without
              // it the form silently does nothing as far as the user can tell.
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              >
                {error}
              </div>
            ) : null}
            <Button type="submit" className="w-full" disabled={loading || checkingSetup}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>

          <div className="mt-4 text-sm text-muted-foreground">
            {needsSetup ? (
              <Link className="text-primary hover:underline" href="/setup">
                Create the first admin account
              </Link>
            ) : (
              <span>
                New staff users are created inside the admin panel under <strong className="text-foreground">Users</strong>.
              </span>
            )}
          </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
