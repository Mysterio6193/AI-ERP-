// Recipes for the RDM finished goods.
//
// Quantities are per batch in each component's own base unit — bags of flour,
// blocks of mozzarella, drums of passata. Waste percentages reflect real losses:
// dough trimming is the big one.
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  console.log("🍕 Seeding recipes...")

  const company = await prisma.company.findFirst({
    where: { tradingName: "RDM Pizza" },
    select: { id: true },
  })

  const bySku = async (sku: string) => {
    const product = await prisma.product.findUnique({ where: { sku }, select: { id: true } })
    if (!product) throw new Error(`Missing product ${sku}. Run seed-rdm.ts first.`)
    return product.id
  }

  const flour = await bySku("RM-FLOUR-25KG")
  const yeast = await bySku("RM-YEAST-5KG")
  const mozzarella = await bySku("RM-MOZZ-10KG")
  const passata = await bySku("RM-PASSATA-20L")
  const carton = await bySku("RM-CARTON-FLAT")
  const bags = await bySku("RM-FREEZERBAG")

  const recipes = [
    {
      sku: "RDM-NAP-30-12",
      name: "Napoli Rustica 30cm — slow ferment",
      yieldQty: 40,
      yieldUnit: "carton",
      standardTimeMinutes: 240,
      instructions:
        "Poolish overnight. Mix, rest 24h at 4C, hand stretch to 30cm, par-bake 90s, snap freeze within 15 minutes.",
      lines: [
        { componentId: flour, quantity: 6, unit: "bag", wastePercent: 2 },
        { componentId: yeast, quantity: 0.4, unit: "block", wastePercent: 0 },
        { componentId: passata, quantity: 1.5, unit: "drum", wastePercent: 3 },
        { componentId: carton, quantity: 1, unit: "pack", wastePercent: 1 },
        { componentId: bags, quantity: 0.5, unit: "roll", wastePercent: 1 },
      ],
    },
    {
      sku: "RDM-DB-180-40",
      name: "Dough Ball 180g — snap frozen",
      yieldQty: 60,
      yieldUnit: "carton",
      standardTimeMinutes: 180,
      instructions:
        "Slow ferment, divide to 180g, round, snap freeze within 15 minutes to hold dough integrity.",
      lines: [
        { componentId: flour, quantity: 8, unit: "bag", wastePercent: 3 },
        { componentId: yeast, quantity: 0.6, unit: "block", wastePercent: 0 },
        { componentId: bags, quantity: 0.8, unit: "roll", wastePercent: 1 },
      ],
    },
    {
      sku: "RDM-PIZG-24",
      name: "Pizzetti Grab & Go — topped",
      yieldQty: 30,
      yieldUnit: "carton",
      standardTimeMinutes: 300,
      instructions: "Base as Napoli, top with passata and mozzarella, blast freeze, retail carton.",
      lines: [
        { componentId: flour, quantity: 4, unit: "bag", wastePercent: 2 },
        { componentId: yeast, quantity: 0.3, unit: "block", wastePercent: 0 },
        { componentId: passata, quantity: 2, unit: "drum", wastePercent: 4 },
        { componentId: mozzarella, quantity: 3, unit: "block", wastePercent: 5 },
        { componentId: carton, quantity: 1, unit: "pack", wastePercent: 1 },
      ],
    },
  ]

  for (const recipe of recipes) {
    const productId = await bySku(recipe.sku)

    const existing = await prisma.billOfMaterial.findFirst({
      where: { productId, name: recipe.name },
      select: { id: true },
    })

    if (existing) {
      console.log(`   ↷ ${recipe.name} already exists`)
      continue
    }

    await prisma.billOfMaterial.create({
      data: {
        productId,
        name: recipe.name,
        yieldQty: recipe.yieldQty,
        yieldUnit: recipe.yieldUnit,
        standardTimeMinutes: recipe.standardTimeMinutes,
        instructions: recipe.instructions,
        status: "active",
        companyId: company?.id ?? null,
        lines: {
          create: recipe.lines.map((line, index) => ({ ...line, sortOrder: index })),
        },
      },
    })

    console.log(`   ✅ ${recipe.name} (${recipe.lines.length} ingredients → ${recipe.yieldQty} ${recipe.yieldUnit})`)
  }

  console.log("🎉 Recipes seeded")
}

main()
  .catch((error) => {
    console.error("❌ Recipe seed failed:", error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
