import { tool, type Tool, type ToolExecutionOptions } from "ai"
import type { z } from "zod"
import { recordToolOutcome } from "@/lib/agent/tool-health"

/**
 * Thin wrapper over the SDK's `tool()`.
 *
 * This project compiles with `noImplicitAny: false`, which defeats the
 * inference in `tool()`'s overload set: the input type collapses to `never`
 * and every call fails to typecheck. A single-signature helper infers cleanly,
 * so tool authors still get typed `execute` inputs without the project having
 * to flip a compiler flag that thousands of existing lines depend on.
 */
export function defineTool<S extends z.ZodType, R>(config: {
  description: string
  inputSchema: S
  execute: (input: z.infer<S>, options: ToolExecutionOptions<never>) => Promise<R>
  /** Set for a tool whose failures are not worth tracking. */
  skipHealthTracking?: boolean
}): Tool<z.infer<S>, R> {
  const { skipHealthTracking, ...rest } = config

  /**
   * Every tool passes through here, which is the only place a hundred and
   * forty-five of them can be watched without touching each one.
   *
   * A tool that threw and a tool that returned `{ ok: false }` are both
   * failures — several bugs in this codebase were tools returning ok with an
   * empty result, which is exactly the shape that hides.
   */
  const watched = async (input: z.infer<S>, options: ToolExecutionOptions<never>) => {
    const toolName = toolNameFor(config.description)

    /**
     * Only count what the model actually did.
     *
     * The SDK supplies a `toolCallId` when a tool is invoked as part of a turn.
     * A script calling `execute(input, {})` directly has none — and such a call
     * also bypasses the Zod validation the SDK would have run first, so it can
     * fail in ways the agent never could.
     *
     * That is not hypothetical. Two verification scripts in this repo called
     * tools directly with partial arguments, and both tools were recorded as
     * broken and then reported as broken to the agent, which was told to avoid
     * two tools that work. Health tracking that cannot tell a probe from a
     * turn produces exactly the wrong answer with total confidence.
     */
    const fromModel = Boolean((options as { toolCallId?: string } | undefined)?.toolCallId)
    const track = !skipHealthTracking && fromModel

    try {
      const result = await config.execute(input, options)

      if (track) {
        const failed =
          typeof result === "object" && result !== null && "ok" in result && (result as { ok: unknown }).ok === false

        void recordToolOutcome({
          toolName,
          ok: !failed,
          error: failed ? String((result as { error?: unknown }).error ?? "Tool reported ok: false") : undefined,
        })
      }

      return result
    } catch (error) {
      if (track) {
        void recordToolOutcome({
          toolName,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      // Rethrown: health tracking observes, it does not swallow.
      throw error
    }
  }

  return tool({ ...rest, execute: watched } as never) as Tool<z.infer<S>, R>
}

/**
 * A stable name for a tool.
 *
 * `defineTool` never receives the key it is registered under, and the
 * description is the only thing that distinguishes one tool from another here.
 * A short hash of it is stable across restarts and unique per tool, which is
 * all the health record needs — the readable name is attached where the tools
 * are registered.
 */
const nameCache = new Map<string, string>()

function toolNameFor(description: string): string {
  const cached = nameCache.get(description)
  if (cached) return cached

  const registered = TOOL_NAMES.get(description)
  const name = registered ?? `tool:${hash(description)}`

  nameCache.set(description, name)
  return name
}

function hash(value: string): string {
  let h = 0
  for (let i = 0; i < value.length; i++) {
    h = (h << 5) - h + value.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h).toString(36)
}

/** Filled in where tools are registered, so health records read as real names. */
export const TOOL_NAMES = new Map<string, string>()
