"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function AdminSetupPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [checkingState, setCheckingState] = useState(true)
  const [error, setError] = useState("")
  const [form, setForm] = useState({
    companyName: "Jumbo Foods",
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
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
    <div className="min-h-screen bg-black px-4 py-10 text-white">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <div className="apple-eyebrow">Initial setup</div>
          <div className="max-w-2xl space-y-4">
            <h1 className="text-[40px] font-semibold tracking-[-0.04em] text-white md:text-[56px]">
              Create the first admin account and bring the OS online.
            </h1>
            <p className="max-w-xl text-[17px] text-white/72">
              This creates the initial business identity and unlocks the dashboard, users, commerce controls, inventory, and finance modules.
            </p>
          </div>
        </div>
        <Card className="w-full max-w-2xl justify-self-end bg-white text-[#1d1d1f]">
          <CardHeader className="space-y-2">
            <CardTitle className="text-[32px]">Set up SupplySure OS</CardTitle>
            <CardDescription>
              Create the first admin account for the dashboard. After this, you can add more staff from the Users module.
            </CardDescription>
          </CardHeader>
          <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="companyName">Business name</Label>
              <Input
                id="companyName"
                value={form.companyName}
                onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                placeholder="Jumbo Foods"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Admin user"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="admin@jumbofoods.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                placeholder="Repeat password"
              />
            </div>
            {error ? (
              <div className="md:col-span-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            ) : null}
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={loading || checkingState}>
                {loading ? "Creating admin..." : "Create admin account"}
              </Button>
            </div>
          </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
