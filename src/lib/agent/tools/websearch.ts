import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"

/**
 * Hermes-inspired Web Search & Market Intelligence.
 * Enables live internet searches for product specifications, competitor pricing,
 * food safety recalls, and general information.
 */

export function buildWebSearchTools(principal: AgentPrincipal) {
  return {
    searchWeb: defineTool({
      description:
        "Perform a live web search for market commodity prices, supplier info, food safety notices, barcode lookups, or product specifications.",
      inputSchema: z.object({
        query: z.string().describe("Search query, e.g. 'current wholesale butter prices Australia' or 'FSANZ food recall alerts'"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          // Use DuckDuckGo HTML search endpoint
          const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
          const response = await fetch(searchUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
            signal: AbortSignal.timeout(10000),
          })

          if (!response.ok) {
            return { ok: false as const, error: `Search engine returned status ${response.status}` }
          }

          const html = await response.text()
          const results: Array<{ title: string; snippet: string; url: string }> = []

          // Match results from DDG HTML
          const resultRegex = /<a class="result__snippet[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g
          const titleRegex = /<a class="result__url[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g

          // Clean HTML tags
          const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&").trim()

          const snippets: string[] = []
          let match
          const snippetBlockRegex = /<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/gi
          while ((match = snippetBlockRegex.exec(html)) !== null && snippets.length < limit) {
            snippets.push(stripTags(match[1]))
          }

          const titles: string[] = []
          const links: string[] = []
          const linkBlockRegex = /<a class="result__a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
          while ((match = linkBlockRegex.exec(html)) !== null && titles.length < limit) {
            links.push(match[1])
            titles.push(stripTags(match[2]))
          }

          for (let i = 0; i < titles.length; i++) {
            results.push({
              title: titles[i],
              url: links[i],
              snippet: snippets[i] || "",
            })
          }

          if (results.length === 0) {
            return {
              ok: true as const,
              query,
              results: [],
              message: `No public search results found for "${query}".`,
            }
          }

          return {
            ok: true as const,
            query,
            count: results.length,
            results,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Web search error: ${error instanceof Error ? error.message : "search failed"}`,
          }
        }
      },
    }),
  }
}
