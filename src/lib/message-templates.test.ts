import { describe, expect, it } from "vitest"

import { renderTemplate, templateVariables } from "./message-templates"

/**
 * The risk in a template system is not storing text, it is filling it in.
 * A message that ships with {{amount}} still in it tells a customer they owe
 * {{amount}}; one that silently blanks it tells them they owe nothing.
 */

describe("renderTemplate", () => {
  it("fills in what it is given", () => {
    const result = renderTemplate("Hi {{name}}, you owe {{amount}}.", {
      name: "Marco",
      amount: "$412.50",
    })

    expect(result.text).toBe("Hi Marco, you owe $412.50.")
    expect(result.ok).toBe(true)
  })

  it("reports a placeholder it could not fill, and leaves it visible", () => {
    // Blanking it would read as a finished sentence — "you owe ." — and go out
    // looking fine. Left visible, it is obviously broken and gets caught.
    const result = renderTemplate("Hi {{name}}, you owe {{amount}}.", { name: "Marco" })

    expect(result.ok).toBe(false)
    expect(result.missing).toEqual(["amount"])
    expect(result.text).toContain("{{amount}}")
  })

  it("treats an empty string as missing, not as a value", () => {
    // An empty contact name would address the customer as nobody.
    expect(renderTemplate("Hi {{name}}", { name: "" }).missing).toEqual(["name"])
  })

  it("treats zero and false as real values", () => {
    // A zero balance is a fact worth stating, not an absent one.
    const result = renderTemplate("{{days}} days, paid: {{paid}}", { days: 0, paid: false })

    expect(result.text).toBe("0 days, paid: false")
    expect(result.ok).toBe(true)
  })

  it("tolerates spaces inside the braces", () => {
    expect(renderTemplate("Hi {{ name }}", { name: "Marco" }).text).toBe("Hi Marco")
  })

  it("reports each missing placeholder once, however often it appears", () => {
    const result = renderTemplate("{{amount}} and again {{amount}}", {})
    expect(result.missing).toEqual(["amount"])
  })

  it("does not treat a value's own braces as a placeholder", () => {
    // A customer literally named "{{admin}}" must not cause a second pass.
    const result = renderTemplate("Hi {{name}}", { name: "{{amount}}" })

    expect(result.text).toBe("Hi {{amount}}")
    expect(result.ok).toBe(true)
  })

  it("leaves text with no placeholders alone", () => {
    expect(renderTemplate("Nothing to fill.", {}).text).toBe("Nothing to fill.")
  })
})

describe("templateVariables", () => {
  it("lists what a template expects, so a caller knows what to supply", () => {
    expect(templateVariables("Hi {{name}}, invoice {{invoiceNumber}} for {{amount}}")).toEqual([
      "name",
      "invoiceNumber",
      "amount",
    ])
  })

  it("lists a repeated placeholder once", () => {
    expect(templateVariables("{{a}} {{a}} {{b}}")).toEqual(["a", "b"])
  })
})
