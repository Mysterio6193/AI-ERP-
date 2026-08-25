import { describe, expect, it } from "vitest"

import { defaultSlugFor, FALLBACK_SLUGS, getFallback, OPS_TOOLS } from "./definitions"
import { TOOL_POLICY } from "./tools"

const staff = (role: string) => ({ kind: "staff", role, userId: "u1" }) as never

describe("defaultSlugFor", () => {
  it("sends each staff role to its own agent rather than all to ops", () => {
    // Every staff member used to get `ops`, which carries the whole registry —
    // measured at ~5x the prompt tokens of a narrow agent.
    expect(defaultSlugFor(staff("sales"))).toBe("sales")
    expect(defaultSlugFor(staff("warehouse"))).toBe("warehouse")
    expect(defaultSlugFor(staff("accounts"))).toBe("accounts")
  })

  it("keeps admins on the full registry, since they do reach everywhere", () => {
    expect(defaultSlugFor(staff("admin"))).toBe("ops")
  })

  it("falls back to ops for an unrecognised role rather than to nothing", () => {
    expect(defaultSlugFor(staff("driver"))).toBe("ops")
    expect(defaultSlugFor(staff("something-new"))).toBe("ops")
  })

  it("keeps customers isolated on the customer agent", () => {
    expect(defaultSlugFor({ kind: "customer", customerId: "c1" } as never)).toBe("customer")
  })
})

describe("role agent allowlists", () => {
  const roleAgents = ["sales", "warehouse", "accounts", "purchasing", "compliance", "executive", "marketing", "hr", "demand"] as const

  it("names only tools that actually exist", () => {
    // A typo here silently gives the agent fewer tools than intended, and the
    // only symptom is the agent saying it cannot do something it should. This
    // caught "receiveStock", which is spelled receivePurchaseOrder.
    for (const slug of [...roleAgents, "ops"] as const) {
      for (const tool of getFallback(slug).tools ?? []) {
        expect(TOOL_POLICY[tool], `${slug} lists unknown tool "${tool}"`).toBeDefined()
      }
    }
  })

  it("keeps every OPS_TOOLS entry real", () => {
    for (const tool of OPS_TOOLS) {
      expect(TOOL_POLICY[tool], `OPS_TOOLS lists unknown tool "${tool}"`).toBeDefined()
    }
  })

  it("stays far below the full registry, which is the whole point", () => {
    const total = Object.keys(TOOL_POLICY).length

    for (const slug of roleAgents) {
      const count = getFallback(slug).tools?.length ?? total
      expect(count, `${slug} should be narrow`).toBeLessThan(total / 2)
    }
  })

  it("keeps money tools away from the warehouse", () => {
    const tools = getFallback("warehouse").tools ?? []

    for (const forbidden of ["recordPayment", "setCreditStatus", "createSalesOrder", "agedReceivables", "listInvoices"]) {
      expect(tools, `warehouse must not reach ${forbidden}`).not.toContain(forbidden)
    }
  })

  it("keeps stock writes and order creation away from accounts", () => {
    const tools = getFallback("accounts").tools ?? []

    for (const forbidden of ["adjustInventory", "quarantineStock", "releaseStock", "createSalesOrder", "createPickList"]) {
      expect(tools, `accounts must not reach ${forbidden}`).not.toContain(forbidden)
    }
  })

  it("gives sales what it needs to quote and log a visit", () => {
    const tools = getFallback("sales").tools ?? []

    for (const needed of ["quoteBasket", "createSalesOrder", "logCustomerNote", "createTask", "createCase", "lapsedAccounts"]) {
      expect(tools, `sales needs ${needed}`).toContain(needed)
    }
  })

  it("lets every role remember, so context survives between conversations", () => {
    for (const slug of roleAgents) {
      expect(getFallback(slug).tools).toContain("remember")
    }
  })

  it("gives ops more reach than any single role, but still not everything", () => {
    // ops is the admin default. It has to span the business, but the free-tier
    // prompt cap means "every tool" is not an option: 94 tools overflowed it.
    const ops = getFallback("ops").tools ?? []
    const total = Object.keys(TOOL_POLICY).length

    for (const slug of roleAgents) {
      expect(ops.length).toBeGreaterThan((getFallback(slug).tools ?? []).length)
    }
    expect(ops.length).toBeLessThan(total)
  })

  it("defines a fallback for every slug the router can produce", () => {
    for (const slug of ["ops", "sales", "warehouse", "accounts", "customer"]) {
      expect(FALLBACK_SLUGS, `defaultSlugFor can return "${slug}"`).toContain(slug)
    }
  })
})
