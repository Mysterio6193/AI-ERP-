import { db } from "@/lib/db"

/**
 * Allergen declaration and cross-contamination checks.
 *
 * Declaring allergens is a legal requirement (FSANZ Standard 1.2.3), and this
 * site makes gluten-free lines alongside wheat ones — which is precisely the
 * situation the rule exists for. An undeclared allergen is a recall and a
 * potentially fatal one.
 *
 * The check here is deliberately conservative: it compares what a recipe's
 * ingredients contain against what the finished product declares, and reports
 * anything present but undeclared. It does not auto-correct the label, because
 * a person is accountable for what goes on a pack.
 */

/** The allergens that must be declared here. */
export const DECLARABLE = [
  "gluten",
  "wheat",
  "milk",
  "egg",
  "soy",
  "peanut",
  "treenut",
  "sesame",
  "fish",
  "crustacean",
  "mollusc",
  "lupin",
  "sulphites",
] as const

export type Allergen = (typeof DECLARABLE)[number]

export function parseAllergens(json: string | null): string[] {
  if (!json) {
    return []
  }

  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed)
      ? parsed
          .filter((entry): entry is string => typeof entry === "string")
          .map((entry) => entry.toLowerCase().trim())
          .filter(Boolean)
      : []
  } catch {
    return []
  }
}

export interface AllergenFinding {
  allergen: string
  /** Ingredients that bring it in. */
  from: string[]
  /** Present in an ingredient but absent from the product's own declaration. */
  undeclared: boolean
}

export interface AllergenCheck {
  ok: boolean
  product: string
  declared: string[]
  mayContain: string[]
  findings: AllergenFinding[]
  /** Undeclared allergens. Non-empty means do not print the label. */
  problems: string[]
  /** A gluten-free claim on a product whose recipe contains gluten. */
  contradictions: string[]
}

/**
 * Checks a recipe's declared allergens against its ingredients.
 *
 * Run before a production run so a mislabelled batch is caught before it is
 * made rather than after it has shipped.
 */
export async function checkBomAllergens(bomId: string): Promise<AllergenCheck | { ok: false; error: string }> {
  const bom = await db.billOfMaterial.findUnique({
    where: { id: bomId },
    include: {
      product: {
        select: {
          name: true,
          allergensJson: true,
          mayContainJson: true,
        },
      },
      lines: {
        include: {
          component: { select: { name: true, allergensJson: true, mayContainJson: true } },
        },
      },
    },
  })

  if (!bom) {
    return { ok: false as const, error: "Recipe not found" }
  }

  const declared = parseAllergens(bom.product.allergensJson)
  const mayContain = parseAllergens(bom.product.mayContainJson)

  const sources = new Map<string, string[]>()

  for (const line of bom.lines) {
    // "May contain" on an ingredient becomes at least "may contain" on the
    // output — carried forward rather than dropped.
    for (const allergen of [
      ...parseAllergens(line.component.allergensJson),
      ...parseAllergens(line.component.mayContainJson),
    ]) {
      sources.set(allergen, [...(sources.get(allergen) || []), line.component.name])
    }
  }

  const findings: AllergenFinding[] = [...sources.entries()].map(([allergen, from]) => ({
    allergen,
    from: [...new Set(from)],
    undeclared: !declared.includes(allergen) && !mayContain.includes(allergen),
  }))

  const problems = findings.filter((finding) => finding.undeclared).map((finding) => finding.allergen)

  // A free-from claim in the name that the recipe contradicts. This is the
  // failure that hurts people, so it is called out separately from a missing
  // declaration.
  const contradictions: string[] = []
  const name = bom.product.name.toLowerCase()

  for (const [claim, allergen] of [
    ["gluten free", "gluten"],
    ["gluten-free", "gluten"],
    ["dairy free", "milk"],
    ["dairy-free", "milk"],
    ["nut free", "treenut"],
  ] as const) {
    if (name.includes(claim) && sources.has(allergen)) {
      contradictions.push(
        `"${bom.product.name}" claims ${claim} but the recipe contains ${allergen} via ${(sources.get(allergen) || []).join(", ")}`
      )
    }
  }

  return {
    ok: problems.length === 0 && contradictions.length === 0,
    product: bom.product.name,
    declared,
    mayContain,
    findings: findings.sort((a, b) => Number(b.undeclared) - Number(a.undeclared)),
    problems,
    contradictions,
  }
}

/** Products whose declaration does not match their recipe. */
export async function auditAllergens() {
  const boms = await db.billOfMaterial.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  })

  const issues: Array<{
    bomId: string
    recipe: string
    product: string
    undeclared: string[]
    contradictions: string[]
  }> = []

  for (const bom of boms) {
    const check = await checkBomAllergens(bom.id)

    if ("error" in check) {
      continue
    }

    if (!check.ok) {
      issues.push({
        bomId: bom.id,
        recipe: bom.name,
        product: check.product,
        undeclared: check.problems,
        contradictions: check.contradictions,
      })
    }
  }

  return { checked: boms.length, issues }
}
