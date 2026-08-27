"use client"

import { useEffect } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

/**
 * What a page shows when it throws.
 *
 * Without this file Next renders its own screen, which in production says
 * "Application error: a client-side exception has occurred" and nothing else —
 * no indication of which part failed, no way back, and nothing the person can
 * repeat to whoever fixes it. On an operations system that is the difference
 * between "the orders page is broken" and "the whole thing is down".
 *
 * The digest is shown deliberately. It is the only handle a user has on a
 * specific failure, and asking someone to describe an error they cannot see is
 * how a report becomes unactionable.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Page error:", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded-lg border border-rose-300 bg-rose-50 p-5 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <h2 className="font-semibold">This page could not load</h2>
        </div>

        <p className="opacity-90">
          Something went wrong rendering this screen. Nothing you were doing has been saved.
        </p>

        {error.digest ? (
          <p className="font-mono text-xs opacity-75">Reference: {error.digest}</p>
        ) : null}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded border border-rose-300 px-3 py-1.5 text-xs font-medium hover:bg-rose-100 dark:border-rose-800 dark:hover:bg-rose-900"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center rounded px-3 py-1.5 text-xs font-medium underline underline-offset-2"
          >
            Back to the dashboard
          </a>
        </div>
      </div>
    </div>
  )
}
