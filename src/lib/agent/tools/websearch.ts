import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"

/**
 * Hermes-inspired Web Search & Market Intelligence.
 * Enables live internet searches for product specifications, competitor pricing,
 * food safety recalls, and general information.
 */


export interface WebSearchResult {
  title: string
  snippet: string
  url: string
}

/** Entities that actually appear in DuckDuckGo's result text. */
function decodeEntities(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * DuckDuckGo wraps every result in a redirect:
 * `//duckduckgo.com/l/?uddg=<encoded real url>&rut=...`
 *
 * Handed on as-is it is useless to a reader and to anything that wants to
 * fetch the page, so the real destination is pulled back out.
 */
export function resolveDuckDuckGoUrl(href: string): string {
  const cleaned = decodeEntities(href)

  const match = cleaned.match(/[?&]uddg=([^&]+)/)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch {
      // A malformed redirect is better returned raw than thrown away.
    }
  }

  return cleaned.startsWith("//") ? `https:${cleaned}` : cleaned
}

/**
 * Pull results out of DuckDuckGo's HTML page.
 *
 * Written to survive attribute order, which is what broke it: the real markup
 * is `<a rel="nofollow" class="result__a" href=...>`, and a pattern anchored on
 * `<a class="result__a` never matched it. The tool then returned ok with zero
 * results and a message saying the internet had nothing on the subject, which
 * is worse than an error — the agent believed it.
 */
export function looksBlocked(html: string): boolean {
  // DuckDuckGo answers a rate-limited request with 202 and an "anomaly" page
  // that carries no results. Treating that as "nothing found" is the dangerous
  // reading: an agent asked about food recalls would report that there are
  // none, when in fact it never got to look.
  return /anomaly|unfortunately, bots use duckduckgo|captcha/i.test(html) && !/result__a/i.test(html)
}

/** A sponsored slot is not a search result. */
function isAdvert(url: string, attrs: string): boolean {
  return /[?&]ad_provider=|[?&]ad_domain=|\/y\.js\?/i.test(url) || /class="[^"]*result--ad/i.test(attrs)
}

export function parseDuckDuckGoHtml(html: string, limit: number): WebSearchResult[] {
  const results: WebSearchResult[] = []

  // Any anchor, then check its attributes — rather than assuming their order.
  const anchors = html.matchAll(/<a\s+([^>]*)>([\s\S]*?)<\/a>/gi)

  const titles: Array<{ url: string; title: string }> = []
  const snippets: string[] = []

  for (const anchor of anchors) {
    const attrs = anchor[1]
    const inner = anchor[2]

    const href = attrs.match(/href="([^"]*)"/i)?.[1]
    if (!href) continue

    if (/class="[^"]*\bresult__a\b[^"]*"/i.test(attrs)) {
      const url = resolveDuckDuckGoUrl(href)
      if (isAdvert(url, attrs)) continue

      const title = decodeEntities(inner)
      if (title) titles.push({ url, title })
    } else if (/class="[^"]*\bresult__snippet\b[^"]*"/i.test(attrs)) {
      snippets.push(decodeEntities(inner))
    }
  }

  for (let i = 0; i < titles.length && results.length < limit; i++) {
    results.push({
      title: titles[i].title,
      url: titles[i].url,
      snippet: snippets[i] || "",
    })
  }

  return results
}

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

          if (looksBlocked(html)) {
            // Reported as a failure, not as an empty result: the difference
            // between "nothing was found" and "we could not look" matters, and
            // only one of them should stop someone acting.
            return {
              ok: false as const,
              error:
                "The search engine rate-limited this request, so nothing could be looked up. This is not a statement that no results exist — try again shortly.",
            }
          }

          const results = parseDuckDuckGoHtml(html, limit)

          if (results.length === 0) {
            return {
              ok: true as const,
              query,
              results: [],
              message: `The search returned no results for "${query}". This is a genuine empty result, not a failed lookup.`,
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
