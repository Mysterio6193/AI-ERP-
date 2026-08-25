import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"

const recordToolOutcome = vi.fn()

vi.mock("@/lib/agent/tool-health", () => ({
  recordToolOutcome: (...args: unknown[]) => recordToolOutcome(...args),
}))

const { defineTool } = await import("@/lib/agent/tools/define")

/** The SDK supplies a toolCallId only when the model invoked the tool. */
const FROM_MODEL = { toolCallId: "call_1886043" } as never
const FROM_SCRIPT = {} as never

function makeTool(execute: () => Promise<unknown>) {
  return defineTool({
    description: `Test tool ${Math.random()} for health tracking behaviour.`,
    inputSchema: z.object({}),
    execute,
  }) as never as { execute: (input: unknown, options: unknown) => Promise<unknown> }
}

describe("defineTool health tracking", () => {
  beforeEach(() => recordToolOutcome.mockClear())

  it("records a failure the model caused", async () => {
    const tool = makeTool(async () => {
      throw new Error("upstream exploded")
    })

    await tool.execute({}, FROM_MODEL).catch(() => undefined)

    expect(recordToolOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: "upstream exploded" })
    )
  })

  it("ignores a direct call from a script", async () => {
    // A script calling execute() also skips the SDK's Zod validation, so it can
    // fail in ways the agent never could. Two working tools in this repo were
    // marked broken and reported to the agent as broken because of exactly
    // this — a probe with partial arguments.
    const tool = makeTool(async () => {
      throw new Error("probe called it wrongly")
    })

    await tool.execute({}, FROM_SCRIPT).catch(() => undefined)

    expect(recordToolOutcome).not.toHaveBeenCalled()
  })

  it("still rethrows for a direct call — tracking observes, it does not swallow", async () => {
    const tool = makeTool(async () => {
      throw new Error("boom")
    })

    await expect(tool.execute({}, FROM_SCRIPT)).rejects.toThrow("boom")
  })

  it("counts a returned { ok: false } as a failure, not a success", async () => {
    // The shape that hides: a tool that reports trouble without throwing.
    const tool = makeTool(async () => ({ ok: false, error: "no such customer" }))

    await tool.execute({}, FROM_MODEL)

    expect(recordToolOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: "no such customer" })
    )
  })

  it("records a success", async () => {
    const tool = makeTool(async () => ({ ok: true, count: 3 }))

    await tool.execute({}, FROM_MODEL)

    expect(recordToolOutcome).toHaveBeenCalledWith(expect.objectContaining({ ok: true }))
  })

  it("returns the tool's own result unchanged", async () => {
    const tool = makeTool(async () => ({ ok: true, rows: [1, 2] }))

    await expect(tool.execute({}, FROM_MODEL)).resolves.toEqual({ ok: true, rows: [1, 2] })
  })
})
