/**
 * What to do when the server says the session is no longer good.
 *
 * The proxy verifies a session token's signature; the API routes go further and
 * look the user up. A token can therefore be perfectly valid and belong to
 * nobody — after a user is deleted, or a database restored — and the two checks
 * then disagree: the page loads, and every request for data on it returns 401.
 *
 * The result is the worst kind of broken. The application renders completely,
 * every figure reads zero, and nothing on screen suggests the reader is in
 * effect signed out.
 *
 * Redirecting alone is not enough, and this is the part worth knowing: the
 * proxy sends anyone holding a signature-valid cookie *away* from /signin, so a
 * bare redirect bounces straight back and loops. The cookie is httpOnly, so the
 * browser cannot clear it either. The session has to be ended server-side
 * first, which is what the signout endpoint is for.
 */

let handling = false

export function handleSessionExpiry(status: number): boolean {
  if (status !== 401) return false
  if (typeof window === "undefined") return false
  if (window.location.pathname.startsWith("/signin")) return false

  // Six dashboard feeds fail at once; without this they would each try to sign
  // out and redirect, racing each other.
  if (handling) return true
  handling = true

  const next = encodeURIComponent(window.location.pathname + window.location.search)

  void fetch("/api/admin/session", { method: "DELETE" })
    .catch(() => {
      // Even if signing out fails, going to /signin is better than staying on a
      // screen of zeros — the proxy may bounce it back, but the attempt is the
      // honest one.
    })
    .finally(() => {
      window.location.href = `/signin?next=${next}&reason=expired`
    })

  return true
}

/** Test seam: the guard above is module state and would leak between cases. */
export function resetSessionExpiryGuard() {
  handling = false
}
