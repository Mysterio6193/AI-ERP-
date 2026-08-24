import { describe, expect, it } from "vitest"

import { looksBlocked, parseDuckDuckGoHtml, resolveDuckDuckGoUrl } from "./websearch"

/**
 * The search tool returned ok with zero results and a message saying the
 * internet had nothing on the subject — while the parser was simply broken and,
 * later, while the engine was rate-limiting. For a food business an agent that
 * reports "no recall notices found" when it never got to look is the dangerous
 * version of a bug.
 */

// Real markup, attribute order included — that order is what broke it.
const RESULT_HTML = `
<div class="links_main links_deep result__body">
  <h2 class="result__title">
    <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tridge.com%2Fmozzarella&amp;rut=abc">Australia Mozzarella wholesale price - Tridge</a>
  </h2>
  <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tridge.com%2Fmozzarella&amp;rut=abc">Discover daily updated <b>prices</b> of
  Mozzarella Cheese in Australia</a>
</div>`

const AD_HTML = `
<a rel="nofollow" class="result__a" href="//duckduckgo.com/y.js?ad_domain=ebay.com.au&amp;ad_provider=bingv7aa">Wholesale cheese on eBay</a>
<a class="result__snippet" href="//duckduckgo.com/y.js?ad_provider=bingv7aa">Free shipping on eBay</a>`

describe("parseDuckDuckGoHtml", () => {
  it("finds a result even though rel comes before class", () => {
    // The original pattern was anchored on `<a class="result__a`, which never
    // matched `<a rel="nofollow" class="result__a"`.
    const results = parseDuckDuckGoHtml(RESULT_HTML, 5)

    expect(results).toHaveLength(1)
    expect(results[0].title).toContain("Tridge")
  })

  it("reads a snippet that spans a newline", () => {
    // `.` does not match a newline, and the snippet text wraps.
    expect(parseDuckDuckGoHtml(RESULT_HTML, 5)[0].snippet).toContain("Australia")
  })

  it("strips the bold tags search engines put through the middle of words", () => {
    expect(parseDuckDuckGoHtml(RESULT_HTML, 5)[0].snippet).toContain("prices")
    expect(parseDuckDuckGoHtml(RESULT_HTML, 5)[0].snippet).not.toContain("<b>")
  })

  it("skips sponsored slots", () => {
    // An ad is not an answer, and quoting one back as a market price would be.
    expect(parseDuckDuckGoHtml(AD_HTML, 5)).toHaveLength(0)
  })

  it("honours the limit", () => {
    expect(parseDuckDuckGoHtml(RESULT_HTML.repeat(4), 2)).toHaveLength(2)
  })

  it("returns nothing for markup with no results, rather than throwing", () => {
    expect(parseDuckDuckGoHtml("<html><body>nothing here</body></html>", 5)).toEqual([])
  })
})

describe("resolveDuckDuckGoUrl", () => {
  it("unwraps the redirect to the real destination", () => {
    const url = resolveDuckDuckGoUrl("//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.tridge.com%2Fmozzarella&amp;rut=abc")
    expect(url).toBe("https://www.tridge.com/mozzarella")
  })

  it("makes a protocol-relative link absolute", () => {
    expect(resolveDuckDuckGoUrl("//example.com/page")).toBe("https://example.com/page")
  })

  it("returns a plain url untouched", () => {
    expect(resolveDuckDuckGoUrl("https://example.com/page")).toBe("https://example.com/page")
  })
})

describe("looksBlocked", () => {
  it("recognises the rate-limit page", () => {
    // Answered with HTTP 202 and no results at all.
    expect(looksBlocked("<html>...anomaly detected...</html>")).toBe(true)
  })

  it("does not mistake a real result page for a block", () => {
    expect(looksBlocked(RESULT_HTML)).toBe(false)
  })

  it("does not flag an ordinary empty page", () => {
    // Genuinely no results is a different answer from being refused, and only
    // one of them should stop someone acting on it.
    expect(looksBlocked("<html><body>No results.</body></html>")).toBe(false)
  })
})
