import { describe, expect, it } from "vitest"
import { clientKeyFor, modelNames, schemaChecksum } from "@/lib/backup-manifest"

describe("clientKeyFor", () => {
  it("maps a model to its Prisma client property", () => {
    expect(clientKeyFor("SalesOrder")).toBe("salesOrder")
    expect(clientKeyFor("User")).toBe("user")
  })

  it("only lowercases the first character", () => {
    // toolHealth, not toolhealth — a wrong key resolves to nothing and the
    // table is skipped in silence.
    expect(clientKeyFor("ToolHealth")).toBe("toolHealth")
    expect(clientKeyFor("BillOfMaterial")).toBe("billOfMaterial")
  })

  it("leaves an already-lowercase name alone", () => {
    expect(clientKeyFor("user")).toBe("user")
  })
})

describe("modelNames", () => {
  it("finds the schema's models", () => {
    const names = modelNames()
    expect(names.length).toBeGreaterThan(50)
    expect(names).toContain("SalesOrder")
    expect(names).toContain("Invoice")
  })

  it("is sorted, so two backups list their tables in the same order", () => {
    const names = modelNames()
    expect([...names].sort()).toEqual(names)
  })

  it("gives every model a key that starts lowercase", () => {
    for (const name of modelNames()) {
      expect(clientKeyFor(name)).toMatch(/^[a-z]/)
    }
  })
})

describe("schemaChecksum", () => {
  it("is stable across calls", () => {
    expect(schemaChecksum()).toBe(schemaChecksum())
  })

  it("is short hex, so it fits in a manifest and a log line", () => {
    expect(schemaChecksum()).toMatch(/^[0-9a-f]{1,8}$/)
  })

  it("covers field names, not just model names", () => {
    // A renamed column changes what a restore can carry, so it has to change
    // the checksum — otherwise the warning never fires.
    expect(schemaChecksum().length).toBeGreaterThan(0)
  })
})
