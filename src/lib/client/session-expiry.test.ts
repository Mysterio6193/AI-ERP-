import { afterEach, describe, expect, it, vi } from "vitest"

import { handleSessionExpiry, resetSessionExpiryGuard } from "@/lib/client/session-expiry"

/**
 * A token can be validly signed and belong to nobody — after a user is deleted,
 * or a database restored. The page then loads and every figure on it reads
 * zero, which says nothing about needing to sign in again.
 */

const withLocation = (pathname: string, search = "") => {
  const assigned: string[] = []
  vi.stubGlobal("window", {
    location: {
      pathname,
      search,
      set href(value: string) {
        assigned.push(value)
      },
      get href() {
        return assigned[assigned.length - 1] ?? ""
      },
    },
  })
  return assigned
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetSessionExpiryGuard()
})

describe("handleSessionExpiry", () => {
  it("ends the session server-side before redirecting", async () => {
    // The proxy sends anyone holding a signature-valid cookie away from
    // /signin, so redirecting without signing out first loops forever.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal("fetch", fetchMock)

    const assigned = withLocation("/orders")
    expect(handleSessionExpiry(401)).toBe(true)
    await vi.waitFor(() => expect(assigned.length).toBe(1))

    expect(fetchMock).toHaveBeenCalledWith("/api/admin/session", { method: "DELETE" })
    expect(assigned[0]).toContain("/signin")
  })

  it("still redirects when signing out fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    const assigned = withLocation("/orders")
    handleSessionExpiry(401)
    await vi.waitFor(() => expect(assigned.length).toBe(1))
    expect(assigned[0]).toContain("/signin")
  })

  it("handles only the first of several simultaneous failures", () => {
    // Six dashboard feeds fail together; without a guard each would sign out
    // and redirect, racing the others.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    withLocation("/")
    expect(handleSessionExpiry(401)).toBe(true)
    expect(handleSessionExpiry(401)).toBe(true)
  })

  it("remembers where they were, so they land back there", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const assigned = withLocation("/crm/accounts", "?tab=leads")
    handleSessionExpiry(401)
    await vi.waitFor(() => expect(assigned.length).toBe(1))
    expect(assigned[0]).toContain(encodeURIComponent("/crm/accounts?tab=leads"))
  })

  it("says why, so the sign-in page can explain rather than look arbitrary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }))
    const assigned = withLocation("/")
    handleSessionExpiry(401)
    await vi.waitFor(() => expect(assigned.length).toBe(1))
    expect(assigned[0]).toContain("reason=expired")
  })

  it("does nothing for any other status", () => {
    withLocation("/orders")
    for (const status of [200, 400, 403, 404, 500]) {
      expect(handleSessionExpiry(status)).toBe(false)
    }
  })

  it("does not redirect when already on the sign-in page", () => {
    // Otherwise a 401 there sends it to itself, forever.
    withLocation("/signin")
    expect(handleSessionExpiry(401)).toBe(false)
  })

  it("does nothing on the server, where there is no window to redirect", () => {
    vi.stubGlobal("window", undefined)
    expect(handleSessionExpiry(401)).toBe(false)
  })
})
