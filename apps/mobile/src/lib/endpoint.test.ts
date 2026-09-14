import { describe, expect, it, vi } from "vitest"

import {
  defaultApiBase,
  displayApiHost,
  normalizeApiBase,
  probeApiBase,
  usesCustomApiBase,
} from "./endpoint"

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    body: null,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

describe("normalizeApiBase", () => {
  it("accepts a bare host, because that is what people type", () => {
    const result = normalizeApiBase("erp.freshdistribution.com.au")
    expect(result).toEqual({ ok: true, url: "https://erp.freshdistribution.com.au" })
  })

  it("keeps only the origin", () => {
    // A path would silently break every request built on top of this.
    const result = normalizeApiBase("https://erp.example.com/some/path?x=1")
    expect(result.ok && result.url).toBe("https://erp.example.com")
  })

  it("keeps a non-default port", () => {
    const result = normalizeApiBase("https://erp.example.com:8443")
    expect(result.ok && result.url).toBe("https://erp.example.com:8443")
  })

  it("refuses plain http to a public host", () => {
    // A driver signs in from a phone on a stranger's network; this is the rule
    // that keeps those credentials off the wire.
    const result = normalizeApiBase("http://erp.example.com")
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe("insecure")
    expect(result.error).toContain("https")
  })

  it("allows plain http on a network the user controls", () => {
    // Exactly how a warehouse reaches its own box.
    for (const host of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://192.168.1.50:3000",
      "http://10.0.0.8",
      "http://172.16.4.2",
      "http://warehouse-nas.local",
      "http://100.101.102.103", // Tailscale / CGNAT
    ]) {
      const result = normalizeApiBase(host)
      expect(result.ok, `${host} should be allowed`).toBe(true)
    }
  })

  it("does not mistake a public address for a private one", () => {
    // 172.32 is outside the private range; 100.128 is outside CGNAT.
    for (const host of ["http://172.32.0.1", "http://100.128.0.1", "http://11.0.0.1"]) {
      const result = normalizeApiBase(host)
      expect(result.ok, `${host} should be refused over http`).toBe(false)
    }
  })

  it("explains an empty or unparseable address rather than throwing", () => {
    expect(normalizeApiBase("")).toMatchObject({ ok: false, reason: "invalid" })
    expect(normalizeApiBase("   ")).toMatchObject({ ok: false, reason: "invalid" })
    expect(normalizeApiBase("ftp://files.example.com")).toMatchObject({
      ok: false,
      reason: "invalid",
    })
  })
})

describe("probeApiBase", () => {
  it("accepts a server that reports itself healthy", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "ok" }))
    const result = await probeApiBase("https://erp.example.com", fetchImpl as unknown as typeof fetch)

    expect(result).toEqual({ ok: true, url: "https://erp.example.com" })
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://erp.example.com/api/health",
      expect.objectContaining({ method: "GET" })
    )
  })

  it("tells a reachable stranger apart from our own server", async () => {
    // Someone's blog answers 200 with HTML. It is reachable, just not ours.
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      body: null,
      text: async () => "<!doctype html><title>a blog</title>",
    })) as unknown as typeof fetch

    const result = await probeApiBase("https://example.com", fetchImpl)
    expect(result).toMatchObject({ ok: false, reason: "not-ours" })
  })

  it("reports an unhealthy server as such rather than accepting it", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ status: "degraded" })
    ) as unknown as typeof fetch

    const result = await probeApiBase("https://erp.example.com", fetchImpl)
    expect(result).toMatchObject({ ok: false, reason: "not-ours" })
    if (result.ok) return
    expect(result.error).toContain("not healthy")
  })

  it("reports a host that cannot be reached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Network request failed")
    }) as unknown as typeof fetch

    const result = await probeApiBase("https://nothing.example.com", fetchImpl)
    expect(result).toMatchObject({ ok: false, reason: "unreachable" })
  })

  it("refuses an invalid address without making a request at all", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch

    const result = await probeApiBase("http://erp.example.com", fetchImpl)

    expect(result).toMatchObject({ ok: false, reason: "insecure" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("treats a non-2xx as not ours", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false)) as unknown as typeof fetch
    const result = await probeApiBase("https://erp.example.com", fetchImpl)
    expect(result).toMatchObject({ ok: false, reason: "not-ours" })
  })
})

describe("display helpers", () => {
  it("shows the host alone", () => {
    expect(displayApiHost("https://erp.example.com:8443")).toBe("erp.example.com:8443")
    expect(displayApiHost("not a url")).toBe("not a url")
  })

  it("knows when the user has pointed at their own server", () => {
    expect(usesCustomApiBase("https://erp.example.com", "http://localhost:3000")).toBe(true)
    expect(usesCustomApiBase("http://localhost:3000", "http://localhost:3000")).toBe(false)
  })

  it("has a usable default", () => {
    expect(defaultApiBase()).toMatch(/^https?:\/\//)
  })
})
