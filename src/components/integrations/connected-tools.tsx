"use client"

/**
 * The tools a person has connected, and the ones they could.
 *
 * Grouped by what the tool is FOR rather than by vendor, because someone comes
 * here wanting "my calendar in this thing" and does not care whether that means
 * Google or Microsoft. Every provider shows whatever its real state is —
 * connected, available, or needing setup — since a tool that simply vanishes
 * when unconfigured looks like one this product does not support.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Check, ExternalLink, Loader2, RefreshCw } from "lucide-react"

import { ProviderLogo } from "@/components/integrations/provider-logo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

interface ProviderRow {
  id: string
  name: string
  vendor: string
  category: string
  categoryLabel: string
  summary: string
  grants: string[]
  configured: boolean
  setupHint: string | null
  connection: {
    status: string
    account: string | null
    expiresAt: string | null
    lastSyncAt: string | null
    lastError: string | null
  } | null
}

export function ConnectedTools() {
  const { toast } = useToast()
  const [providers, setProviders] = useState<ProviderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [encryptionHint, setEncryptionHint] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)

    try {
      const response = await fetch("/api/integrations")
      const result = await response.json().catch(() => null)

      if (result?.success) {
        setProviders(result.data.providers)
        setEncryptionHint(result.data.encryptionHint)
        return
      }

      /**
       * Rendering nothing on failure was the bug: an empty section under a
       * heading reads as "this product has no integrations", not as "the
       * request failed". Say which it is.
       */
      setLoadError(
        result?.error ||
          (response.status === 401
            ? "You need to sign in again to see your connected tools."
            : `Could not load integrations (HTTP ${response.status}).`)
      )
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not reach the server.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()

    // The callback sends the browser back here with the outcome in the URL.
    const params = new URLSearchParams(window.location.search)
    const connected = params.get("connected")
    const error = params.get("error")

    if (connected) toast({ title: `${connected} connected` })
    if (error) toast({ variant: "destructive", title: "Could not connect", description: error })

    if (connected || error) {
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [load, toast])

  const disconnect = useCallback(
    async (provider: ProviderRow) => {
      setBusy(provider.id)
      try {
        const result = await fetch("/api/integrations", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider: provider.id }),
        }).then((response) => response.json())

        if (result.success) {
          toast({ title: `${provider.name} disconnected`, description: result.data.note })
          await load()
        } else {
          toast({ variant: "destructive", title: "Could not disconnect", description: result.error })
        }
      } finally {
        setBusy(null)
      }
    },
    [load, toast]
  )

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading connected tools…
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-2">
          <p>{loadError}</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3 w-3" />
            Try again
          </Button>
        </div>
      </div>
    )
  }

  const categories = [...new Set(providers.map((provider) => provider.categoryLabel))]

  return (
    <div className="space-y-6">
      {encryptionHint ? (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{encryptionHint}</span>
        </div>
      ) : null}

      {categories.map((category) => (
        <div key={category} className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">{category}</h3>

          <div className="grid gap-3 md:grid-cols-2">
            {providers
              .filter((provider) => provider.categoryLabel === category)
              .map((provider) => {
                const connection = provider.connection
                const isConnected = connection?.status === "connected"

                return (
                  <Card key={provider.id} className={isConnected ? "border-emerald-300 dark:border-emerald-800" : undefined}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <ProviderLogo provider={provider.id} name={provider.name} className="mt-0.5 h-8 w-8 shrink-0" />

                        <div className="min-w-0 flex-1">
                          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                            {provider.name}
                            {isConnected ? (
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                <Check className="mr-1 h-3 w-3" />
                                Connected
                              </Badge>
                            ) : !provider.configured ? (
                              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                                Setup required
                              </Badge>
                            ) : null}
                          </CardTitle>
                          <CardDescription className="text-xs">{provider.summary}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3 text-xs">
                      {isConnected && connection?.account ? (
                        <p className="text-muted-foreground">
                          Connected as <span className="font-medium text-foreground">{connection.account}</span>
                        </p>
                      ) : null}

                      {connection?.lastError ? (
                        <p className="text-rose-600 dark:text-rose-400">{connection.lastError}</p>
                      ) : null}

                      {!isConnected ? (
                        <div>
                          <p className="mb-1 text-muted-foreground">Connecting lets it:</p>
                          <ul className="space-y-0.5 text-muted-foreground">
                            {provider.grants.map((grant) => (
                              <li key={grant}>· {grant}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {provider.setupHint ? (
                        <p className="rounded border bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                          {provider.setupHint}
                        </p>
                      ) : null}

                      <div className="flex gap-2 pt-1">
                        {isConnected ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={busy === provider.id}
                              asChild
                            >
                              <a href={`/api/integrations/${provider.id}/connect`}>
                                <RefreshCw className="mr-1 h-3 w-3" />
                                Reconnect
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground"
                              disabled={busy === provider.id}
                              onClick={() => void disconnect(provider)}
                            >
                              {busy === provider.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" className="h-7 text-xs" disabled={!provider.configured} asChild={provider.configured}>
                            {provider.configured ? (
                              <a href={`/api/integrations/${provider.id}/connect`}>
                                Connect
                                <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            ) : (
                              <span>Connect</span>
                            )}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )
}
