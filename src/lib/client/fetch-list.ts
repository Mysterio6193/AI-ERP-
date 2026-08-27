import { handleSessionExpiry } from "@/lib/client/session-expiry"

/**
 * Fetch a list, distinguishing "nothing there" from "could not ask".
 *
 * Several pages did this instead:
 *
 *     return payload.success ? payload.data || [] : []
 *
 * which renders a failed request as an empty list. On a ledger or a
 * reconciliation screen that is worse than an error: "no journal entries" and
 * "could not load journal entries" are different statements, and one of them
 * tells a bookkeeper the books are empty.
 *
 * Throwing is deliberate. These pages already load inside try/finally, so a
 * throw lands somewhere the page can show it, whereas a returned empty array
 * cannot be told apart from real emptiness by any code downstream.
 */
export async function fetchList<T = unknown>(path: string): Promise<T[]> {
  let response: Response

  try {
    response = await fetch(path)
  } catch {
    throw new Error("Could not reach the server.")
  }

  if (response.status === 401) {
    // Sends them to sign in rather than leaving them reading an empty screen
    // that never explains why it is empty.
    handleSessionExpiry(response.status)
    throw new Error("Your session has expired. Sign in again to see this.")
  }

  const payload = await response.json().catch(() => null)

  if (!payload?.success) {
    throw new Error(
      payload?.error || `Could not load this data (HTTP ${response.status}).`
    )
  }

  return (payload.data as T[]) || []
}

/** What to show a person when a load failed. Short, and never blank. */
export function describeLoadError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "Something went wrong loading this page."
}
