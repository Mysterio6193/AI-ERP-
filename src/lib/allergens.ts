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

/**
 * Free-from claims, and every allergen each one rules out.
 *
 * "Nut free" covers peanuts as well as tree nuts. Peanuts are legumes, so the
 * botany says otherwise, but nobody reading a pack makes that distinction and
 * peanut is the more dangerous of the two — checking only tree nuts would let a
 * peanut through a nut-free claim, which is the exact failure this file exists
 * to prevent.
 *
 * Claims are matched against a normalised name, so "Gluten Free", "gluten-free"
 * and "GLUTEN  FREE" are one rule rather than three near-identical entries that
 * drift apart as people add to them.
 */
const FREE_FROM_CLAIMS: Array<{ claim: string; rules_out: readonly string[] }> = [
  { claim: "gluten free", rules_out: ["gluten", "wheat"] },
  { claim: "wheat free", rules_out: ["wheat"] },
  { claim: "dairy free", rules_out: ["milk"] },
  { claim: "milk free", rules_out: ["milk"] },
  { claim: "nut free", rules_out: ["treenut", "peanut"] },
  { claim: "peanut free", rules_out: ["peanut"] },
  { claim: "egg free", rules_out: ["egg"] },
  { claim: "soy free", rules_out: ["soy"] },
  { claim: "sesame free", rules_out: ["sesame"] },
  // A vegan claim is a free-from claim about every animal allergen at once.
  { claim: "vegan", rules_out: ["milk", "egg", "fish", "crustacean", "mollusc"] },
]

/** Hyphens, extra spaces and case are not different claims. */
function normaliseProductName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

/**
 * Claims on the pack that the recipe contradicts.
 *
 * Separate from a missing declaration because it is worse: a missing allergen
 * is an incomplete label, while a contradicted claim actively tells somebody
 * the thing that will hurt them is not in there.
 */
export function findClaimContradictions(
  productName: string,
  sources: Map<string, string[]>
): string[] {
  const name = normaliseProductName(productName)
  const contradictions: string[] = []

  for (const { claim, rules_out } of FREE_FROM_CLAIMS) {
    if (!name.includes(claim)) continue

    for (const allergen of rules_out) {
      const from = sources.get(allergen)
      if (!from || from.length === 0) continue

      contradictions.push(
        `"${productName}" claims ${claim} but the recipe contains ${allergen} via ${[...new Set(from)].join(", ")}`
      )
    }
  }

  return contradictions
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
  const contradictions = findClaimContradictions(bom.product.name, sources)

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
