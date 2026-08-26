import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { z } from "zod"

import type { AgentPrincipal } from "../context"
import { defineTool } from "./define"

const execFileAsync = promisify(execFile)

/**
 * Agent Reach & Multi-Platform Social Intelligence Suite for SupplySure OS.
 *
 * Full multi-channel internet intelligence suite without paid API fees:
 * 1.  📺 YouTube (Subtitles & Video Search)
 * 2.  🌐 Clean Webpage (Jina Reader & Markdown parser)
 * 3.  📖 Reddit (Community Search & Full Thread / Comment Discussions)
 * 4.  🐦 Twitter / X (Search Tweets, Sentiment, and Discussions)
 * 5.  💼 LinkedIn (Company Profiles, Distributor Pages & Executive Info)
 * 6.  📷 Instagram (Venues, Packaging Visuals & Brand Sentiment)
 * 7.  📘 Facebook (Supplier Business Pages & Community Groups)
 * 8.  📕 XiaoHongShu / RED (FMCG Reviews, Product Sentiment & Consumer Trends)
 * 9.  🎵 TikTok (Viral Food/Beverage Trends & Packaging Innovations)
 * 10. 📦 GitHub (Search Repos, READMEs, Issues, and Discussions)
 * 11. 📡 RSS / Atom (Feed Reader & News Monitoring)
 * 12. 📺 Bilibili (Manufacturing, Machinery, and Video Search)
 * 13. 💻 V2EX (Developer, Tech, and Node Discussions)
 * 14. 📈 Xueqiu (雪球) (Market Quotes & Stock Discussions)
 * 15. 🔍 Semantic Web Search (Exa MCP via mcporter)
 * 16. 🌐 Multi-Social Sentiment Radar (All-in-one multi-platform cross-search)
 * 17. 🩺 Agent Reach Doctor (Diagnostics across all backends)
 */

export interface YoutubeTranscriptSnippet {
  text: string
  start?: number
  duration?: number
}

/** Clean HTML / markdown entity formatting */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Helper to query search indices without API keys */
async function searchDomainIndex(site: string, query: string, limit = 5) {
  try {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(`site:${site} ${query}`)}`
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
      },
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) return []

    const html = await res.text()
    const resultBlocks = Array.from(
      html.matchAll(/<div[^>]*class="[^"]*\bresult__body\b[^"]*"[\s\S]*?<\/div>\s*<\/div>/gi)
    ).slice(0, limit)

    if (resultBlocks.length > 0) {
      return resultBlocks.map((block) => {
        const titleMatch = block[0].match(/<a\s+[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
        const snippetMatch = block[0].match(/<a\s+[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ||
                             block[0].match(/<div\s+[^>]*class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
        const title = titleMatch ? cleanExtractedText(titleMatch[2]) : "Untitled"
        const rawUrl = titleMatch ? titleMatch[1] : ""
        const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/)
        const url = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawUrl
        const snippet = snippetMatch ? cleanExtractedText(snippetMatch[1]) : ""
        return { title, snippet, url }
      })
    }

    const matches = Array.from(
      html.matchAll(/<a\s+[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)
    ).slice(0, limit)

    return matches.map((m) => {
      const title = cleanExtractedText(m[2])
      const rawUrl = m[1]
      const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/)
      const url = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawUrl
      return { title, snippet: "", url }
    })
  } catch {
    return []
  }
}

/** Normalize Reddit JSON post data */
export function formatRedditPost(post: any) {
  const data = post?.data || post
  return {
    title: data?.title || "Untitled",
    subreddit: data?.subreddit_name_prefixed || (data?.subreddit ? `r/${data.subreddit}` : "r/unknown"),
    author: data?.author || "[deleted]",
    score: data?.score ?? 0,
    numComments: data?.num_comments ?? 0,
    url: data?.permalink ? `https://reddit.com${data.permalink}` : data?.url || "",
    selftext: data?.selftext ? data.selftext.slice(0, 1500) : "",
    createdUtc: data?.created_utc ? new Date(data.created_utc * 1000).toISOString() : undefined,
  }
}

/** Extract YouTube Video ID from various URL formats */
export function extractYoutubeVideoId(urlOrId: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId.trim())) {
    return urlOrId.trim()
  }

  const match = urlOrId.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([a-zA-Z0-9_-]{11})/i
  )
  return match ? match[1] : null
}

/** Simple RSS/Atom Feed Parser without external heavy dependencies */
export function parseRssFeedXml(xml: string, limit = 10) {
  const items: Array<{ title: string; link: string; description: string; pubDate?: string }> = []
  
  const itemMatches = xml.matchAll(/<item[\s\S]*?<\/item>/gi)
  for (const match of itemMatches) {
    if (items.length >= limit) break
    const itemBlock = match[0]
    const titleMatch = itemBlock.match(/<title[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/i)
    const linkMatch = itemBlock.match(/<link[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/link>/i)
    const descMatch = itemBlock.match(/<description[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/description>/i)
    const dateMatch = itemBlock.match(/<pubDate[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/pubDate>/i)

    const title = cleanExtractedText(titleMatch?.[1] || titleMatch?.[2] || "Untitled")
    const link = (linkMatch?.[1] || linkMatch?.[2] || "").trim()
    const description = cleanExtractedText(descMatch?.[1] || descMatch?.[2] || "").slice(0, 500)
    const pubDate = (dateMatch?.[1] || dateMatch?.[2] || "").trim()

    if (title || link) {
      items.push({ title, link, description, pubDate })
    }
  }

  if (items.length === 0) {
    const entryMatches = xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)
    for (const match of entryMatches) {
      if (items.length >= limit) break
      const entryBlock = match[0]
      const titleMatch = entryBlock.match(/<title[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/i)
      const linkMatch = entryBlock.match(/<link[^>]*href=["']([^"']+)["']/i) || entryBlock.match(/<link[^>]*>(.*?)<\/link>/i)
      const summaryMatch = entryBlock.match(/<(?:summary|content)[^>]*>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/(?:summary|content)>/i)
      const updatedMatch = entryBlock.match(/<(?:updated|published)[^>]*>(.*?)<\/(?:updated|published)>/i)

      const title = cleanExtractedText(titleMatch?.[1] || titleMatch?.[2] || "Untitled")
      const link = (linkMatch?.[1] || linkMatch?.[2] || "").trim()
      const description = cleanExtractedText(summaryMatch?.[1] || summaryMatch?.[2] || "").slice(0, 500)
      const pubDate = updatedMatch?.[1]?.trim()

      if (title || link) {
        items.push({ title, link, description, pubDate })
      }
    }
  }

  return items
}

export function buildAgentReachTools(principal: AgentPrincipal) {
  return {
    // 1. YouTube Transcript Extractor
    getYoutubeTranscript: defineTool({
      description:
        "Extract subtitles, full transcript, and metadata from a YouTube video URL. Ideal for summarizing supplier demos, machinery operation guides, conference talks, and tutorials.",
      inputSchema: z.object({
        url: z.string().describe("YouTube video URL (e.g., https://www.youtube.com/watch?v=... or https://youtu.be/...)"),
        lang: z.string().optional().default("en").describe("Preferred subtitle language code (default: en)"),
      }),
      execute: async ({ url, lang = "en" }) => {
        const videoId = extractYoutubeVideoId(url)
        if (!videoId) {
          return { ok: false as const, error: "Invalid YouTube URL or Video ID." }
        }

        const standardUrl = `https://www.youtube.com/watch?v=${videoId}`

        try {
          const { stdout } = await execFileAsync(
            "yt-dlp",
            [
              "--skip-download",
              "--write-auto-subs",
              "--write-subs",
              "--sub-langs",
              `${lang},en.*,all`,
              "--dump-json",
              standardUrl,
            ],
            { timeout: 25000, maxBuffer: 10 * 1024 * 1024 }
          )

          const meta = JSON.parse(stdout)
          let transcriptText = ""

          if (meta.subtitles && Object.keys(meta.subtitles).length > 0) {
            const subKey = Object.keys(meta.subtitles).find((k) => k.startsWith(lang)) || Object.keys(meta.subtitles)[0]
            const subEntry = meta.subtitles[subKey]?.[0]
            if (subEntry?.url) {
              const subRes = await fetch(subEntry.url, { signal: AbortSignal.timeout(10000) })
              if (subRes.ok) transcriptText = await subRes.text()
            }
          } else if (meta.automatic_captions && Object.keys(meta.automatic_captions).length > 0) {
            const capKey =
              Object.keys(meta.automatic_captions).find((k) => k.startsWith(lang)) ||
              Object.keys(meta.automatic_captions)[0]
            const capEntry = meta.automatic_captions[capKey]?.[0]
            if (capEntry?.url) {
              const capRes = await fetch(capEntry.url, { signal: AbortSignal.timeout(10000) })
              if (capRes.ok) transcriptText = await capRes.text()
            }
          }

          const cleanTranscript = cleanExtractedText(transcriptText).slice(0, 15000)

          return {
            ok: true as const,
            title: meta.title || "YouTube Video",
            uploader: meta.uploader || meta.channel || "Unknown",
            duration: meta.duration || 0,
            description: meta.description ? meta.description.slice(0, 2000) : "",
            transcript: cleanTranscript || "(No subtitle text could be retrieved directly. Check video description above.)",
            url: standardUrl,
          }
        } catch (ytDlpError) {
          try {
            const jinaUrl = `https://r.jina.ai/${standardUrl}`
            const res = await fetch(jinaUrl, {
              headers: { "User-Agent": "SupplySure-Reach-Agent/1.0" },
              signal: AbortSignal.timeout(15000),
            })

            if (res.ok) {
              const text = await res.text()
              return {
                ok: true as const,
                title: `YouTube Video: ${videoId}`,
                transcript: text.slice(0, 12000),
                url: standardUrl,
                note: "Extracted via Web Reader fallback.",
              }
            }
          } catch {
            // fallback ignore
          }

          return {
            ok: false as const,
            error: `Failed to retrieve YouTube transcript: ${ytDlpError instanceof Error ? ytDlpError.message : "Video unavailable"}`,
          }
        }
      },
    }),

    // 2. YouTube Video Search
    searchYoutube: defineTool({
      description:
        "Search YouTube for videos on topics, supply chain machinery demos, competitor product reviews, or tutorials.",
      inputSchema: z.object({
        query: z.string().describe("Search keywords, e.g. 'industrial pallet wrapper operation' or 'cold chain packing'"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const { stdout } = await execFileAsync(
            "yt-dlp",
            [
              `ytsearch${limit}:${query}`,
              "--dump-json",
              "--flat-playlist",
              "--no-warnings",
            ],
            { timeout: 25000, maxBuffer: 10 * 1024 * 1024 }
          )

          const lines = stdout.trim().split("\n").filter(Boolean)
          const videos = lines.map((line) => {
            try {
              const v = JSON.parse(line)
              return {
                id: v.id,
                title: v.title,
                uploader: v.uploader || v.channel,
                duration: v.duration,
                url: v.url || `https://www.youtube.com/watch?v=${v.id}`,
              }
            } catch {
              return null
            }
          }).filter(Boolean)

          return {
            ok: true as const,
            query,
            count: videos.length,
            videos,
          }
        } catch {
          const results = await searchDomainIndex("youtube.com", query, limit)
          return { ok: true as const, query, source: "DuckDuckGo YouTube Index", count: results.length, videos: results }
        }
      },
    }),

    // 3. Clean Webpage Reader (Jina Reader)
    readCleanWebpage: defineTool({
      description:
        "Fetch and convert any public webpage or article into clean, clutter-free markdown without advertisements, cookie banners, or bloated HTML.",
      inputSchema: z.object({
        url: z.string().url().describe("Target webpage URL to read"),
      }),
      execute: async ({ url }) => {
        try {
          const jinaUrl = `https://r.jina.ai/${url}`
          const response = await fetch(jinaUrl, {
            headers: {
              "User-Agent": "SupplySure-Reach-Agent/1.0",
              Accept: "text/markdown, text/plain, */*",
            },
            signal: AbortSignal.timeout(20000),
          })

          if (!response.ok) {
            const directRes = await fetch(url, { signal: AbortSignal.timeout(15000) })
            if (!directRes.ok) {
              return { ok: false as const, error: `Webpage returned HTTP ${response.status}` }
            }
            const rawHtml = await directRes.text()
            return {
              ok: true as const,
              url,
              content: cleanExtractedText(rawHtml).slice(0, 15000),
              fallback: true,
            }
          }

          const markdown = await response.text()
          return {
            ok: true as const,
            url,
            content: markdown.slice(0, 25000),
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Failed to read webpage: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),

    // 4. Reddit Community Sentiment & Complaint Search
    searchReddit: defineTool({
      description:
        "Search Reddit for authentic customer discussions, product reviews, common complaints, supplier experiences, or industry feedback without requiring API keys.",
      inputSchema: z.object({
        query: z.string().describe("Search keywords, e.g. 'cold storage logistics complaints' or 'ERP software feedback'"),
        subreddit: z.string().optional().describe("Optional specific subreddit (e.g., 'supplychain', 'logistics', 'smallbusiness')"),
        limit: z.number().int().min(1).max(20).optional().default(10),
      }),
      execute: async ({ query, subreddit, limit = 10 }) => {
        try {
          const endpoint = subreddit
            ? `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=relevance&limit=${limit}`
            : `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&limit=${limit}`

          const response = await fetch(endpoint, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko)",
            },
            signal: AbortSignal.timeout(15000),
          })

          if (!response.ok) {
            const results = await searchDomainIndex("reddit.com", `${subreddit ? `r/${subreddit} ` : ""}${query}`, limit)
            return {
              ok: true as const,
              query,
              source: "DuckDuckGo (Reddit Index)",
              count: results.length,
              results,
            }
          }

          const json = await response.json()
          const children = json?.data?.children || []
          const posts = children.slice(0, limit).map(formatRedditPost)

          return {
            ok: true as const,
            query,
            count: posts.length,
            posts,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Reddit search failed: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),

    // 5. Read Full Reddit Thread & Comments
    getRedditThread: defineTool({
      description:
        "Retrieve the full text, score, and top user comments of a specific Reddit post URL.",
      inputSchema: z.object({
        url: z.string().describe("Reddit post URL (e.g. https://www.reddit.com/r/supplychain/comments/...)"),
        maxComments: z.number().int().min(1).max(30).optional().default(10),
      }),
      execute: async ({ url, maxComments = 10 }) => {
        try {
          const cleanUrl = url.split("?")[0].replace(/\/$/, "")
          const jsonUrl = `${cleanUrl}.json`

          const res = await fetch(jsonUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            },
            signal: AbortSignal.timeout(15000),
          })

          if (!res.ok) {
            const jinaRes = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(15000) })
            if (jinaRes.ok) {
              const text = await jinaRes.text()
              return { ok: true as const, url, content: text.slice(0, 15000), source: "Jina Reader Fallback" }
            }
            return { ok: false as const, error: `Failed to fetch Reddit thread: HTTP ${res.status}` }
          }

          const data = await res.json()
          const postData = data?.[0]?.data?.children?.[0]?.data
          const commentsData = data?.[1]?.data?.children || []

          const post = formatRedditPost(postData)
          const comments = commentsData
            .filter((c: any) => c.kind === "t1" && c.data?.body)
            .slice(0, maxComments)
            .map((c: any) => ({
              author: c.data.author,
              score: c.data.score,
              body: c.data.body.slice(0, 800),
            }))

          return {
            ok: true as const,
            post,
            commentCount: comments.length,
            comments,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Failed to load Reddit thread: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),

    // 6. X / Twitter Search & Sentiment
    searchTwitter: defineTool({
      description:
        "Search Twitter / X for real-time tweets, vendor sentiment, breaking industry alerts, or executive statements.",
      inputSchema: z.object({
        query: z.string().describe("Search keywords or hashtags (e.g., 'supply chain disruption' or 'cold chain freight')"),
        limit: z.number().int().min(1).max(15).optional().default(5),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const tweets = await searchDomainIndex("twitter.com", query, limit)
          if (tweets.length > 0) {
            return { ok: true as const, query, count: tweets.length, tweets }
          }
          const xTweets = await searchDomainIndex("x.com", query, limit)
          return { ok: true as const, query, count: xTweets.length, tweets: xTweets }
        } catch (error) {
          return {
            ok: false as const,
            error: `Twitter search failed: ${error instanceof Error ? error.message : "search error"}`,
          }
        }
      },
    }),

    // 7. LinkedIn Search (Companies, Profiles & Job Postings)
    searchLinkedIn: defineTool({
      description:
        "Search LinkedIn for supplier corporate profiles, distributor pages, executive backgrounds, or supply chain hiring trends.",
      inputSchema: z.object({
        query: z.string().describe("Company name, person title, or topic (e.g., 'Sysco Logistics Director' or 'DHL Supply Chain Australia')"),
        type: z.enum(["company", "profile", "general"]).optional().default("general").describe("Search focus"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, type = "general", limit = 5 }) => {
        try {
          let siteFilter = "linkedin.com"
          if (type === "company") siteFilter = "linkedin.com/company"
          if (type === "profile") siteFilter = "linkedin.com/in"

          const results = await searchDomainIndex(siteFilter, query, limit)
          return {
            ok: true as const,
            query,
            type,
            count: results.length,
            results,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `LinkedIn search failed: ${error instanceof Error ? error.message : "search error"}`,
          }
        }
      },
    }),

    // 8. Instagram Search (Packaging Aesthetics, Venues & Brand Sentiment)
    searchInstagram: defineTool({
      description:
        "Search Instagram for restaurant venues, food packaging visuals, brand accounts, and catering aesthetics without requiring login.",
      inputSchema: z.object({
        query: z.string().describe("Brand name, venue handle, or product hashtag (e.g., 'artisan sourdough sydney' or 'sustainable food packaging')"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const results = await searchDomainIndex("instagram.com", query, limit)
          return {
            ok: true as const,
            query,
            count: results.length,
            results,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Instagram search failed: ${error instanceof Error ? error.message : "search error"}`,
          }
        }
      },
    }),

    // 8.1. Get Instagram Public Profile & Post Snippets (No Login Required)
    getInstagramProfile: defineTool({
      description:
        "Extract public profile bio, follower count estimates, recent post snippets, and business category for an Instagram handle without needing a login.",
      inputSchema: z.object({
        handle: z.string().describe("Instagram username or profile URL (e.g. 'rdmpizzaaustralia' or '@rdmpizzaaustralia')"),
      }),
      execute: async ({ handle }) => {
        const cleanHandle = handle
          .replace(/^@/, "")
          .replace(/https?:\/\/(?:www\.)?instagram\.com\//, "")
          .replace(/\/.*$/, "")
          .trim()
        const profileUrl = `https://www.instagram.com/${cleanHandle}/`

        // 1. Try Jina Reader bypass
        let jinaBio = ""
        try {
          const jinaRes = await fetch(`https://r.jina.ai/${profileUrl}`, {
            headers: { "User-Agent": "SupplySure-Reach-Agent/1.0" },
            signal: AbortSignal.timeout(10000),
          })
          if (jinaRes.ok) {
            jinaBio = await jinaRes.text()
          }
        } catch {}

        // 2. Search Index Snippets
        const indexResults = await searchDomainIndex("instagram.com", cleanHandle, 6)

        return {
          ok: true as const,
          handle: cleanHandle,
          profileUrl,
          directSnippet: jinaBio ? cleanExtractedText(jinaBio).slice(0, 4000) : undefined,
          indexedPostsAndSnippets: indexResults,
        }
      },
    }),

    // 9. Facebook Business & Supplier Groups Search
    searchFacebook: defineTool({
      description:
        "Search Facebook for food supplier business pages, regional wholesale distributor pages, and industry trade groups.",
      inputSchema: z.object({
        query: z.string().describe("Supplier name, trade group keyword, or local wholesale hub"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const results = await searchDomainIndex("facebook.com", query, limit)
          return {
            ok: true as const,
            query,
            count: results.length,
            results,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Facebook search failed: ${error instanceof Error ? error.message : "search error"}`,
          }
        }
      },
    }),

    // 10. XiaoHongShu / RED (小红书) Consumer Sentiment Search
    searchXiaoHongShu: defineTool({
      description:
        "Search XiaoHongShu (小红书 / RED) for consumer food & beverage reviews, trending packaged goods, and authentic user experiences.",
      inputSchema: z.object({
        query: z.string().describe("Product name, FMCG brand, or ingredient trend (e.g. '燕麦奶测评' or '预制菜口感')"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const results = await searchDomainIndex("xiaohongshu.com", query, limit)
          return {
            ok: true as const,
            query,
            count: results.length,
            results,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `XiaoHongShu search failed: ${error instanceof Error ? error.message : "search error"}`,
          }
        }
      },
    }),

    // 11. TikTok Video & Trend Search
    searchTikTok: defineTool({
      description:
        "Search TikTok for viral food trends, innovative restaurant concepts, kitchen hacks, and beverage recipes.",
      inputSchema: z.object({
        query: z.string().describe("Food trend or keyword (e.g., 'viral butter board' or 'matcha packaging design')"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const results = await searchDomainIndex("tiktok.com", query, limit)
          return {
            ok: true as const,
            query,
            count: results.length,
            results,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `TikTok search failed: ${error instanceof Error ? error.message : "search error"}`,
          }
        }
      },
    }),

    // 12. Multi-Social Sentiment Radar (All-in-One Cross Platform Scan)
    aggregateSocialSentiment: defineTool({
      description:
        "Scan multiple social networks concurrently (Reddit, X/Twitter, YouTube, LinkedIn, Instagram) for a brand, vendor, or ingredient and return a consolidated social brief.",
      inputSchema: z.object({
        target: z.string().describe("Brand, supplier, or product name to investigate"),
        limitPerPlatform: z.number().int().min(1).max(5).optional().default(3),
      }),
      execute: async ({ target, limitPerPlatform = 3 }) => {
        try {
          const [reddit, twitter, youtube, linkedin, instagram] = await Promise.all([
            searchDomainIndex("reddit.com", target, limitPerPlatform),
            searchDomainIndex("twitter.com", target, limitPerPlatform),
            searchDomainIndex("youtube.com", target, limitPerPlatform),
            searchDomainIndex("linkedin.com/company", target, limitPerPlatform),
            searchDomainIndex("instagram.com", target, limitPerPlatform),
          ])

          return {
            ok: true as const,
            target,
            platforms: {
              reddit: { count: reddit.length, results: reddit },
              twitter: { count: twitter.length, results: twitter },
              youtube: { count: youtube.length, results: youtube },
              linkedin: { count: linkedin.length, results: linkedin },
              instagram: { count: instagram.length, results: instagram },
            },
            totalFindings: reddit.length + twitter.length + youtube.length + linkedin.length + instagram.length,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Multi-social aggregation failed: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),

    // 13. GitHub Repository & Code Intelligence
    searchGithub: defineTool({
      description:
        "Search GitHub repositories, view stargazers, descriptions, topics, and latest updates for open-source supply chain, ERP, or developer tools.",
      inputSchema: z.object({
        query: z.string().describe("Search keywords, e.g. 'warehouse management system' or 'route optimization'"),
        sort: z.enum(["stars", "updated", "forks"]).optional().default("stars"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, sort = "stars", limit = 5 }) => {
        try {
          const endpoint = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=${sort}&per_page=${limit}`
          const res = await fetch(endpoint, {
            headers: {
              "User-Agent": "SupplySure-Agent/1.0",
              Accept: "application/vnd.github.v3+json",
            },
            signal: AbortSignal.timeout(15000),
          })

          if (!res.ok) {
            return { ok: false as const, error: `GitHub API error: HTTP ${res.status}` }
          }

          const data = await res.json()
          const items = (data?.items || []).slice(0, limit).map((r: any) => ({
            name: r.full_name,
            description: r.description || "No description",
            stars: r.stargazers_count,
            forks: r.forks_count,
            url: r.html_url,
            language: r.language,
            updatedAt: r.updated_at,
          }))

          return {
            ok: true as const,
            query,
            totalFound: data?.total_count || 0,
            repositories: items,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `GitHub search failed: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),

    // 14. RSS / Atom Feed Reader
    readRssFeed: defineTool({
      description:
        "Parse and read any RSS, Atom, or News XML feed for supply chain news, agricultural commodity bulletins, or regulatory updates.",
      inputSchema: z.object({
        feedUrl: z.string().url().describe("The RSS or Atom XML feed URL"),
        limit: z.number().int().min(1).max(20).optional().default(10),
      }),
      execute: async ({ feedUrl, limit = 10 }) => {
        try {
          const res = await fetch(feedUrl, {
            headers: { "User-Agent": "SupplySure-RSS-Reader/1.0" },
            signal: AbortSignal.timeout(15000),
          })

          if (!res.ok) {
            return { ok: false as const, error: `Feed returned HTTP ${res.status}` }
          }

          const xml = await res.text()
          const items = parseRssFeedXml(xml, limit)

          return {
            ok: true as const,
            feedUrl,
            count: items.length,
            articles: items,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Failed to read RSS feed: ${error instanceof Error ? error.message : "parse error"}`,
          }
        }
      },
    }),

    // 15. V2EX Community & Node Intelligence
    searchV2ex: defineTool({
      description:
        "Search or retrieve hot topics, developer discussions, and tech posts from V2EX.",
      inputSchema: z.object({
        node: z.string().optional().describe("Specific node name (e.g. 'hot', 'tech', 'programmer')"),
      }),
      execute: async ({ node = "hot" }) => {
        try {
          const endpoint =
            node === "hot"
              ? "https://www.v2ex.com/api/topics/hot.json"
              : `https://www.v2ex.com/api/topics/show.json?node_name=${encodeURIComponent(node)}`

          const res = await fetch(endpoint, { signal: AbortSignal.timeout(15000) })
          if (!res.ok) {
            return { ok: false as const, error: `V2EX API error: HTTP ${res.status}` }
          }

          const topics = await res.json()
          const formatted = (Array.isArray(topics) ? topics : []).slice(0, 10).map((t: any) => ({
            title: t.title,
            url: t.url,
            replies: t.replies,
            content: t.content ? t.content.slice(0, 400) : "",
            created: t.created ? new Date(t.created * 1000).toISOString() : undefined,
          }))

          return {
            ok: true as const,
            node,
            count: formatted.length,
            topics: formatted,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `V2EX fetch failed: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),

    // 16. Bilibili Video Search
    searchBilibili: defineTool({
      description:
        "Search Bilibili for manufacturing process videos, packaging demonstrations, industrial equipment teardowns, or technical tutorials.",
      inputSchema: z.object({
        keyword: z.string().describe("Search keyword, e.g. '自动化仓储' or '食品冷链包装'"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ keyword, limit = 5 }) => {
        try {
          const searchUrl = `https://api.bilibili.com/x/web-interface/search/type?search_type=video&keyword=${encodeURIComponent(keyword)}`
          const res = await fetch(searchUrl, {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            signal: AbortSignal.timeout(15000),
          })

          if (!res.ok) {
            return { ok: false as const, error: `Bilibili API returned status ${res.status}` }
          }

          const data = await res.json()
          const rawVideos = data?.data?.result || []
          const videos = rawVideos.slice(0, limit).map((v: any) => ({
            title: cleanExtractedText(v.title || ""),
            author: v.author || "Unknown",
            description: v.description ? v.description.slice(0, 300) : "",
            playCount: v.play || 0,
            duration: v.duration || "",
            url: v.arcurl || (v.bvid ? `https://www.bilibili.com/video/${v.bvid}` : ""),
          }))

          return {
            ok: true as const,
            keyword,
            count: videos.length,
            videos,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Bilibili search error: ${error instanceof Error ? error.message : "search failed"}`,
          }
        }
      },
    }),

    // 17. Xueqiu (雪球) Financial Market & Commodity Sentiment
    searchXueqiu: defineTool({
      description:
        "Search Xueqiu (雪球) for market intelligence, commodity producer stocks, agricultural trends, and trader sentiment.",
      inputSchema: z.object({
        query: z.string().describe("Company name, stock code, or commodity keyword (e.g. '农产品', '海运', or '贵州茅台')"),
        limit: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, limit = 5 }) => {
        try {
          const searchUrl = `https://xueqiu.com/k?q=${encodeURIComponent(query)}`
          const jinaUrl = `https://r.jina.ai/${searchUrl}`
          const res = await fetch(jinaUrl, {
            headers: { "User-Agent": "SupplySure-Reach-Agent/1.0" },
            signal: AbortSignal.timeout(15000),
          })

          if (!res.ok) {
            return { ok: false as const, error: `Xueqiu request returned status ${res.status}` }
          }

          const text = await res.text()
          return {
            ok: true as const,
            query,
            summary: cleanExtractedText(text).slice(0, 10000),
            sourceUrl: searchUrl,
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Xueqiu search failed: ${error instanceof Error ? error.message : "network error"}`,
          }
        }
      },
    }),

    // 18. Semantic Web Search (Exa MCP via mcporter)
    searchSemanticWeb: defineTool({
      description:
        "Perform deep AI semantic search across the entire internet powered by Exa MCP / mcporter.",
      inputSchema: z.object({
        query: z.string().describe("Semantic search query or question"),
        numResults: z.number().int().min(1).max(10).optional().default(5),
      }),
      execute: async ({ query, numResults = 5 }) => {
        try {
          const { stdout } = await execFileAsync(
            "mcporter",
            ["call", "exa", "search", "--args", JSON.stringify({ query, numResults })],
            { timeout: 20000 }
          )

          return {
            ok: true as const,
            query,
            result: stdout.slice(0, 15000),
          }
        } catch (mcpError) {
          try {
            const fallbackUrl = `https://s.jina.ai/${encodeURIComponent(query)}`
            const res = await fetch(fallbackUrl, { signal: AbortSignal.timeout(15000) })
            if (res.ok) {
              const text = await res.text()
              return { ok: true as const, query, source: "Jina AI Search", result: text.slice(0, 12000) }
            }
          } catch {
            // fallback ignore
          }

          return {
            ok: false as const,
            error: `Semantic search failed: ${mcpError instanceof Error ? mcpError.message : "mcporter error"}`,
          }
        }
      },
    }),

    // 19. Agent Reach Diagnostics
    agentReachDoctor: defineTool({
      description:
        "Run diagnostic checks across all Agent Reach web access and social scraping backends to verify status.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { stdout, stderr } = await execFileAsync("agent-reach", ["doctor"], {
            timeout: 20000,
          })

          return {
            ok: true as const,
            report: stdout || stderr || "Diagnostics completed.",
          }
        } catch (error) {
          return {
            ok: false as const,
            error: `Agent Reach Doctor failed: ${error instanceof Error ? error.message : "command failed"}`,
          }
        }
      },
    }),
  }
}
