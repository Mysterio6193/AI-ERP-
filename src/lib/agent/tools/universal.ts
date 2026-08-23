import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"

/**
 * Universal Digital Intelligence & Visualization Tools.
 * Extends Hermes capabilities beyond ERP into general knowledge, visual modeling, and data formatting.
 */

export function buildUniversalTools(principal: AgentPrincipal) {
  return {
    searchKnowledge: defineTool({
      description:
        "Query Wikipedia and global open knowledge repositories for factual information, logistics standards, commodity definitions, food science, and business terms.",
      inputSchema: z.object({
        query: z.string().describe("Topic or term to search for"),
        limit: z.number().int().min(1).max(5).optional().default(3),
      }),
      execute: async ({ query, limit = 3 }) => {
        try {
          const wikiUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&namespace=0&format=json`
          const res = await fetch(wikiUrl, {
            headers: { "User-Agent": "SupplySure-Knowledge/1.0" },
            signal: AbortSignal.timeout(10000),
          })

          if (!res.ok) {
            return { ok: false as const, error: `Knowledge query returned status ${res.status}` }
          }

          const data = await res.json()
          const titles = (data[1] as string[]) || []
          const snippets = (data[2] as string[]) || []
          const urls = (data[3] as string[]) || []

          const results = titles.map((title, i) => ({
            title,
            snippet: snippets[i] || "",
            url: urls[i] || "",
          }))

          return {
            ok: true as const,
            query,
            count: results.length,
            results,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Knowledge search failed: ${error instanceof Error ? error.message : "search error"}`,
          }
        }
      },
    }),

    generateDiagram: defineTool({
      description:
        "Generate a structured Mermaid diagram (Flowchart, Sequence, ERD, State Diagram, or Gantt) to visually explain a workflow, system architecture, or decision tree.",
      inputSchema: z.object({
        type: z.enum(["flowchart", "sequence", "erDiagram", "gantt", "stateDiagram"]).describe("Diagram type"),
        title: z.string().describe("Diagram title"),
        mermaidCode: z.string().describe("Raw Mermaid diagram definition syntax"),
      }),
      execute: async ({ type, title, mermaidCode }) => {
        return {
          ok: true as const,
          type,
          title,
          code: mermaidCode,
          renderedMarkdown: `\`\`\`mermaid\n${mermaidCode.trim()}\n\`\`\``,
          message: `Generated ${type} diagram: "${title}".`,
        }
      },
    }),
  }
}
