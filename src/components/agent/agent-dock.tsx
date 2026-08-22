"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { Sparkles } from "lucide-react"

import { AgentChat } from "@/components/agent/agent-chat"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

/**
 * The agent, available from every page.
 *
 * Opens on Cmd/Ctrl+K and carries the current page as context, so "chase this
 * one" on a customer page means something without the user restating it.
 */

/** Human-readable description of where the user is, passed to the agent. */
function describeRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean)

  if (!segments.length) {
    return "the dashboard"
  }

  const [section, id] = segments
  const label = section.replace(/-/g, " ")

  // A cuid in the second segment means they are looking at one record.
  if (id && id.length > 12) {
    return `a single ${label.replace(/s$/, "")} record (id ${id})`
  }

  return `the ${label} page`
}

const SUGGESTIONS_BY_SECTION: Record<string, string[]> = {
  orders: ["What's awaiting action?", "Any orders stuck in picking?"],
  customers: ["Who's gone quiet lately?", "Who's near their credit limit?"],
  invoices: ["Who's overdue and by how much?", "Draft a chase for the worst one"],
  inventory: ["What's below reorder level?", "What should I reorder today?"],
  products: ["Which products aren't selling?", "What's out of stock?"],
}

const emptySubscribe = () => () => {}

export function AgentDock() {
  const [open, setOpen] = useState(false)
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
  const pathname = usePathname()

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((current) => !current)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const section = pathname.split("/").filter(Boolean)[0] || ""
  const suggestions = useMemo(() => SUGGESTIONS_BY_SECTION[section], [section])

  // The dedicated page is already a chat; a floating one on top would be odd.
  if (!mounted || pathname.startsWith("/ai/chat")) {
    return null
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full shadow-lg"
        aria-label="Open agent"
      >
        <Sparkles className="h-5 w-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Agent
            </SheetTitle>
          </SheetHeader>

          <div className="min-h-0 flex-1">
            <AgentChat
              compact
              suggestions={suggestions}
              pageContext={`the user is looking at ${describeRoute(pathname)}`}
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
