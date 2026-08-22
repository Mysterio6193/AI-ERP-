import { tool, type Tool, type ToolExecutionOptions } from "ai"
import type { z } from "zod"

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
}): Tool<z.infer<S>, R> {
  return tool(config as never) as Tool<z.infer<S>, R>
}
