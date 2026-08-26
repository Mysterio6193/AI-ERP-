import { describe, expect, it, vi } from "vitest"

import { describeLoadError, fetchList } from "@/lib/client/fetch-list"

const respond = (body: unknown, status = 200) =>
  vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  } as Response)

describe("fetchList", () => {
  it("returns the data on success", async () => {
    vi.stubGlobal("fetch", respond({ success: true, data: [1, 2] }))
    await expect(fetchList("/x")).resolves.toEqual([1, 2])
  })

  it("returns an empty list when there genuinely is nothing", async () => {
    vi.stubGlobal("fetch", respond({ success: true, data: [] }))
    await expect(fetchList("/x")).resolves.toEqual([])
  })

  it("throws rather than returning empty when the request failed", async () => {
    // The whole point: a caller must not be able to mistake this for no data.
    vi.stubGlobal("fetch", respond({ success: false, error: "Ledger unavailable" }))
    await expect(fetchList("/x")).rejects.toThrow("Ledger unavailable")
  })

  it("says plainly when the session has gone", async () => {
    vi.stubGlobal("fetch", respond({ success: false }, 401))
    await expect(fetchList("/x")).rejects.toThrow(/session has expired/i)
  })

  it("reports the status when the error carries no message", async () => {
    vi.stubGlobal("fetch", respond({ success: false }, 500))
    await expect(fetchList("/x")).rejects.toThrow(/HTTP 500/)
  })

  it("survives a response that is not JSON at all", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      status: 502,
      json: async () => { throw new Error("not json") },
    } as unknown as Response))

    await expect(fetchList("/x")).rejects.toThrow(/HTTP 502/)
  })

  it("reports an unreachable server rather than a cryptic network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))
    await expect(fetchList("/x")).rejects.toThrow(/Could not reach the server/)
  })

  it("treats a success with no data as empty, not as an error", async () => {
    vi.stubGlobal("fetch", respond({ success: true }))
    await expect(fetchList("/x")).resolves.toEqual([])
  })
})

describe("describeLoadError", () => {
  it("uses the message when there is one", () => {
    expect(describeLoadError(new Error("Ledger unavailable"))).toBe("Ledger unavailable")
  })

  it("never renders blank", () => {
    for (const junk of [null, undefined, {}, "", new Error("")]) {
      expect(describeLoadError(junk).length).toBeGreaterThan(0)
    }
  })
})
