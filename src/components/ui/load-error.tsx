import { AlertTriangle } from "lucide-react"

/**
 * Shown when a page could not load its data.
 *
 * Exists because the alternative several pages used was to render an empty
 * table, and on a ledger or a reconciliation screen an empty table is not a
 * neutral state — it says the books are empty. This says the opposite clearly
 * enough that nobody acts on the absence.
 */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-2">
        <p className="font-medium">{message}</p>
        <p className="opacity-80">
          Nothing below is up to date. Do not treat this as an empty result.
        </p>
        {onRetry ? (
          <button type="button" onClick={onRetry} className="underline underline-offset-2">
            Try again
          </button>
        ) : null}
      </div>
    </div>
  )
}
