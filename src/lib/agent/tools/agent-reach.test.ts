import { describe, expect, it } from "vitest"

import {
  cleanExtractedText,
  extractYoutubeVideoId,
  formatRedditPost,
  parseRssFeedXml,
} from "./agent-reach"

describe("extractYoutubeVideoId", () => {
  it("extracts ID from standard watch URL", () => {
    expect(extractYoutubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("extracts ID from short youtu.be URL", () => {
    expect(extractYoutubeVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ")
  })

  it("extracts ID from shorts URL", () => {
    expect(extractYoutubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("accepts a raw 11-char ID", () => {
    expect(extractYoutubeVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("returns null for invalid strings", () => {
    expect(extractYoutubeVideoId("https://example.com/not-youtube")).toBeNull()
    expect(extractYoutubeVideoId("short")).toBeNull()
  })
})

describe("cleanExtractedText", () => {
  it("strips HTML tags and decodes entities", () => {
    const raw = "<p>Supply &amp; Logistics &quot;Review&quot;</p>"
    expect(cleanExtractedText(raw)).toBe('Supply & Logistics "Review"')
  })

  it("removes excessive newlines and whitespace", () => {
    const raw = "Line 1\n\n\n\n\nLine 2"
    expect(cleanExtractedText(raw)).toBe("Line 1\n\nLine 2")
  })
})

describe("formatRedditPost", () => {
  it("formats reddit JSON post object correctly", () => {
    const raw = {
      data: {
        title: "Cold chain packaging comparison",
        subreddit_name_prefixed: "r/supplychain",
        author: "warehouse_lead",
        score: 42,
        num_comments: 15,
        permalink: "/r/supplychain/comments/abc123/cold_chain_packaging/",
        selftext: "Here are my findings comparing EPS vs VIP panels...",
        created_utc: 1700000000,
      },
    }

    const formatted = formatRedditPost(raw)
    expect(formatted.title).toBe("Cold chain packaging comparison")
    expect(formatted.subreddit).toBe("r/supplychain")
    expect(formatted.score).toBe(42)
    expect(formatted.numComments).toBe(15)
    expect(formatted.url).toBe("https://reddit.com/r/supplychain/comments/abc123/cold_chain_packaging/")
    expect(formatted.selftext).toContain("EPS vs VIP panels")
  })
})

describe("parseRssFeedXml", () => {
  it("parses RSS 2.0 XML with CDATA and standard tags", () => {
    const xml = `
      <rss version="2.0">
        <channel>
          <title>Supply Chain News</title>
          <item>
            <title><![CDATA[Freight Rates Surge 12%]]></title>
            <link>https://news.example.com/freight-rates</link>
            <description>Global shipping container rates rose sharply this week.</description>
            <pubDate>Mon, 25 Aug 2026 08:00:00 GMT</pubDate>
          </item>
          <item>
            <title>Port Automation Expands</title>
            <link>https://news.example.com/ports</link>
            <description><![CDATA[New crane automation technology deployed.]]></description>
          </item>
        </channel>
      </rss>
    `

    const items = parseRssFeedXml(xml, 5)
    expect(items).toHaveLength(2)
    expect(items[0].title).toBe("Freight Rates Surge 12%")
    expect(items[0].link).toBe("https://news.example.com/freight-rates")
    expect(items[0].description).toContain("Global shipping container rates")
    expect(items[1].title).toBe("Port Automation Expands")
  })

  it("parses Atom XML feed format", () => {
    const xml = `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Tech Feed</title>
        <entry>
          <title>Release v2.0</title>
          <link href="https://example.com/v2.0" />
          <summary>Major performance upgrades.</summary>
          <updated>2026-08-25T12:00:00Z</updated>
        </entry>
      </feed>
    `

    const items = parseRssFeedXml(xml, 5)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe("Release v2.0")
    expect(items[0].link).toBe("https://example.com/v2.0")
    expect(items[0].description).toBe("Major performance upgrades.")
  })
})
