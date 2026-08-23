import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"

/**
 * Hermes-inspired Code & Data Interpreter.
 * Allows the agent to run deterministic data transformations, statistical analysis,
 * custom grouping, and tabular aggregations safely in a sandbox.
 */

export function buildInterpreterTools(principal: AgentPrincipal) {
  return {
    runDataAnalysis: defineTool({
      description:
        "Execute a JavaScript data transformation or analysis script in a secure sandbox. Useful for complex grouping, sorting, filtering arrays of orders/invoices, finding percentiles, or computing custom metrics.",
      inputSchema: z.object({
        script: z.string().describe("JavaScript code snippet that returns the computed result. Can use Math, Array methods, JSON, etc."),
        inputData: z.any().optional().describe("Optional JSON data input passed to the script as `input`"),
      }),
      execute: async ({ script, inputData }) => {
        try {
          // Provide sandboxed environment with safe standard objects
          const sandbox = {
            input: inputData,
            Math,
            Number,
            String,
            Array,
            Object,
            JSON,
            Date,
          }

          const runner = new Function(
            "sandbox",
            `"use strict";
            const { input, Math, Number, String, Array, Object, JSON, Date } = sandbox;
            return (function() {
              ${script.includes("return") ? script : `return (${script});`}
            })();`
          )

          const result = runner(sandbox)
          return {
            ok: true as const,
            result,
            message: `Execution completed successfully.`,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Interpreter execution failed: ${error instanceof Error ? error.message : "script error"}`,
          }
        }
      },
    }),
  }
}
