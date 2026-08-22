// SupplySure OS - RDM Pizza Group Seed Data
// Models a real Australian pizza manufacturer (est. 2016, Sydney factory) that
// makes frozen pizza bases, dough balls and specialty flatbreads, distributes
// them to restaurants/pizzerias/foodservice wholesalers, sells retail packs
// through grocery stockists, and sells pizza ovens/equipment under a separate
// brand. The three business lines bill customers from three distinct legal
// entities, so this seed creates three Company rows, each fully scoped with
// its own users, warehouse, products, suppliers, customers and orders.
import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("🍕 Starting RDM Pizza Group seed...")
  const hashedPassword = await hash("password123", 10)

  // ============================================================
  // COMPANY 1: RDM Manufacturing Pty Ltd (trading as RDM Pizza)
  // Foodservice manufacturing + wholesale distribution
  // ============================================================
  const rdmMfg = await prisma.company.create({
    data: {
      name: "RDM Manufacturing Pty Ltd",
      tradingName: "RDM Pizza",
      abn: "41 615 988 415",
      acn: "615 988 415",
      phone: "02 8040 2459",
      email: "orders@rdmpizza.com.au",
      website: "www.rdmpizza.com.au",
      address: "52A Central Hills Drive",
      city: "Gregory Hills",
      state: "NSW",
      postcode: "2557",
      bankName: "Commonwealth Bank of Australia",
      bsb: "062-000",
      accountNumber: "10293847",
      accountName: "RDM Manufacturing Pty Ltd",
      gstRegistered: true,
      gstRate: 10.0,
      defaultTerms: "Payment due per agreed terms. Goods remain property of RDM Manufacturing Pty Ltd until paid in full.",
      setupComplete: true,
    },
  })
  console.log("✅ Created RDM Manufacturing Pty Ltd")

  await prisma.user.create({
    data: {
      email: "admin@rdmpizza.com.au",
      name: "Riccardo Moretti",
      password: hashedPassword,
      role: "admin",
      status: "active",
      phone: "0411 222 333",
      companyId: rdmMfg.id,
    },
  })
  await prisma.user.createMany({
    data: [
      { email: "sales@rdmpizza.com.au", name: "Antonio Russo", password: hashedPassword, role: "sales", status: "active", phone: "0422 333 444", companyId: rdmMfg.id },
      { email: "warehouse@rdmpizza.com.au", name: "Tony Marchetti", password: hashedPassword, role: "warehouse", status: "active", phone: "0433 444 555", companyId: rdmMfg.id },
      { email: "accounts@rdmpizza.com.au", name: "Maria Esposito", password: hashedPassword, role: "accounts", status: "active", phone: "0444 555 666", companyId: rdmMfg.id },
      { email: "driver@rdmpizza.com.au", name: "Sam Nguyen", password: hashedPassword, role: "driver", status: "active", phone: "0455 666 777", companyId: rdmMfg.id },
    ],
  })
  console.log("✅ Created RDM Manufacturing users")

  const mfgWarehouse = await prisma.warehouse.create({
    data: {
      name: "RDM Sydney Factory & Distribution Centre",
      code: "SYD-FAC",
      location: "Gregory Hills, Sydney",
      address: "52A Central Hills Drive",
      city: "Gregory Hills",
      state: "NSW",
      postcode: "2557",
      contactName: "Tony Marchetti",
      contactPhone: "02 8040 2459",
      isDefault: true,
      capacity: 8000,
      companyId: rdmMfg.id,
    },
  })
  console.log("✅ Created factory warehouse")

  const mfgCategories = await prisma.category.createMany({
    data: [
      { name: "Frozen Pizza Bases", description: "Hand-made snap-frozen pizza bases, incl. gluten free", companyId: rdmMfg.id },
      { name: "Dough Balls", description: "Snap-frozen dough balls for hand-stretching in commercial kitchens", companyId: rdmMfg.id },
      { name: "Specialties", description: "Piadini and Pizzetti flatbread lines", companyId: rdmMfg.id },
      { name: "Raw Materials", description: "Flour, dairy, sauce and packaging inputs for pizza production", companyId: rdmMfg.id },
    ],
  })
  console.log("✅ Created categories")

  const mfgCategoryRows = await prisma.category.findMany({ where: { companyId: rdmMfg.id } })
  const mfgCategoryMap = Object.fromEntries(mfgCategoryRows.map(c => [c.name, c.id]))

  const foodservicePriceList = await prisma.priceList.create({
    data: { name: "Foodservice Wholesale", type: "wholesale", isDefault: true, status: "active", companyId: rdmMfg.id },
  })
  const distributorPriceList = await prisma.priceList.create({
    data: { name: "Distributor Pricing", type: "wholesale", isDefault: false, status: "active", companyId: rdmMfg.id },
  })
  console.log("✅ Created price lists")

  // Finished goods - the real RDM product lines (Napoli Rustica, Rustic Edge,
  // Square, Gluten Free bases; Dough Balls; Piadini/Pizzetti specialties)
  const finishedGoods = [
    { sku: "RDM-NAP-30-12", name: "Napoli Rustica Pizza Base 30cm (Carton 12)", category: "Frozen Pizza Bases", baseUnit: "carton", packSize: 12, packUnit: "Carton of 12", wholesalePrice: 54.0, costPrice: 38.5 },
    { sku: "RDM-RUS-30-16", name: "Rustic Edge Pizza Base 30cm (Carton 16)", category: "Frozen Pizza Bases", baseUnit: "carton", packSize: 16, packUnit: "Carton of 16", wholesalePrice: 62.0, costPrice: 44.0 },
    { sku: "RDM-RUS-25-20", name: "Rustic Edge Pizza Base 25cm (Carton 20)", category: "Frozen Pizza Bases", baseUnit: "carton", packSize: 20, packUnit: "Carton of 20", wholesalePrice: 58.0, costPrice: 41.0 },
    { sku: "RDM-SQ-30-12", name: "Square Pizza Base 30x20cm (Carton 12)", category: "Frozen Pizza Bases", baseUnit: "carton", packSize: 12, packUnit: "Carton of 12", wholesalePrice: 50.0, costPrice: 36.0 },
    { sku: "RDM-GF-30-10", name: "Gluten Free Pizza Base 30cm (Carton 10)", category: "Frozen Pizza Bases", baseUnit: "carton", packSize: 10, packUnit: "Carton of 10", wholesalePrice: 68.0, costPrice: 49.0 },
    { sku: "RDM-DB-180-40", name: "Frozen Dough Ball 180g (Carton 40)", category: "Dough Balls", baseUnit: "carton", packSize: 40, packUnit: "Carton of 40", wholesalePrice: 76.0, costPrice: 54.0 },
    { sku: "RDM-DB-260-30", name: "Frozen Dough Ball 260g (Carton 30)", category: "Dough Balls", baseUnit: "carton", packSize: 30, packUnit: "Carton of 30", wholesalePrice: 82.0, costPrice: 59.0 },
    { sku: "RDM-DB-GF-150-30", name: "Gluten Free Dough Ball 150g (Carton 30)", category: "Dough Balls", baseUnit: "carton", packSize: 30, packUnit: "Carton of 30", wholesalePrice: 88.0, costPrice: 64.0 },
    { sku: "RDM-PIAD-20", name: "Piadini Flatbread (Carton 20)", category: "Specialties", baseUnit: "carton", packSize: 20, packUnit: "Carton of 20", wholesalePrice: 46.0, costPrice: 33.0 },
    { sku: "RDM-PIZP-24", name: "Pizzetti Plain 20cm (Carton 24)", category: "Specialties", baseUnit: "carton", packSize: 24, packUnit: "Carton of 24", wholesalePrice: 52.0, costPrice: 37.0 },
    { sku: "RDM-PIZG-24", name: "Pizzetti Grab & Go 20cm (Carton 24)", category: "Specialties", baseUnit: "carton", packSize: 24, packUnit: "Carton of 24", wholesalePrice: 58.0, costPrice: 42.0 },
  ]

  for (const prod of finishedGoods) {
    const product = await prisma.product.create({
      data: {
        sku: prod.sku,
        name: prod.name,
        categoryId: mfgCategoryMap[prod.category],
        baseUnit: prod.baseUnit,
        packSize: prod.packSize,
        packUnit: prod.packUnit,
        wholesalePrice: prod.wholesalePrice,
        costPrice: prod.costPrice,
        gstRate: 10.0,
        gstExempt: false,
        status: "active",
        companyId: rdmMfg.id,
      },
    })

    const quantity = Math.floor(Math.random() * 400) + 80
    await prisma.inventory.create({
      data: {
        productId: product.id,
        warehouseId: mfgWarehouse.id,
        quantity,
        reserved: Math.floor(Math.random() * 30),
        reorderLevel: 40,
        reorderQty: 150,
        avgCost: prod.costPrice,
        lastCost: prod.costPrice,
      },
    })

    await prisma.priceListItem.create({
      data: { priceListId: foodservicePriceList.id, productId: product.id, price: prod.wholesalePrice, minQty: 1 },
    })
    await prisma.priceListItem.create({
      data: { priceListId: distributorPriceList.id, productId: product.id, price: Math.round(prod.wholesalePrice * 0.88 * 100) / 100, minQty: 50 },
    })
  }
  console.log(`✅ Created ${finishedGoods.length} finished-goods products`)

  // Raw materials - inputs to production, not sold, no price-list entries
  const rawMaterials = [
    { sku: "RM-FLOUR-25KG", name: "Premium Baker's Flour (25kg Bag)", baseUnit: "bag", costPrice: 35.0, supplier: "Manildra Group" },
    { sku: "RM-MOZZ-10KG", name: "Whole Milk Mozzarella Block (10kg)", baseUnit: "block", costPrice: 85.0, supplier: "Bulla Dairy Foods" },
    { sku: "RM-PASSATA-20L", name: "Italian Style Passata (20L Drum)", baseUnit: "drum", costPrice: 60.0, supplier: "Kagome Australia" },
    { sku: "RM-YEAST-5KG", name: "Fresh Compressed Yeast (5kg)", baseUnit: "block", costPrice: 45.0, supplier: "Lallemand Australia" },
    { sku: "RM-CARTON-FLAT", name: "Pizza Base Flat Carton Packaging (Pack 500)", baseUnit: "pack", costPrice: 220.0, supplier: "Detmold Group" },
    { sku: "RM-FREEZERBAG", name: "Freezer-Safe Poly Bags (Roll 1000)", baseUnit: "roll", costPrice: 140.0, supplier: "Detmold Group" },
  ]

  const rawMaterialProducts: Record<string, { id: string; costPrice: number; supplier: string }> = {}
  for (const rm of rawMaterials) {
    const product = await prisma.product.create({
      data: {
        sku: rm.sku,
        name: rm.name,
        categoryId: mfgCategoryMap["Raw Materials"],
        baseUnit: rm.baseUnit,
        wholesalePrice: 0,
        costPrice: rm.costPrice,
        gstRate: 10.0,
        status: "active",
        companyId: rdmMfg.id,
      },
    })
    rawMaterialProducts[rm.sku] = { id: product.id, costPrice: rm.costPrice, supplier: rm.supplier }

    await prisma.inventory.create({
      data: {
        productId: product.id,
        warehouseId: mfgWarehouse.id,
        quantity: Math.floor(Math.random() * 60) + 20,
        reserved: 0,
        reorderLevel: 15,
        reorderQty: 40,
        avgCost: rm.costPrice,
        lastCost: rm.costPrice,
      },
    })
  }
  console.log(`✅ Created ${rawMaterials.length} raw-material products`)

  // Ingredient / packaging suppliers
  const mfgSupplierData = [
    { name: "Manildra Group", contactPerson: "David Harrison", email: "sales@manildra.com.au", phone: "02 4964 4400", address: "51 Bridge St", city: "Nowra", state: "NSW", postcode: "2541", paymentTerms: 30, abn: "51 000 057 001" },
    { name: "Bulla Dairy Foods", contactPerson: "Emma Fitzgerald", email: "wholesale@bulla.com.au", phone: "03 5231 2000", address: "1 Bulla Drive", city: "Colac", state: "VIC", postcode: "3250", paymentTerms: 30, abn: "68 004 749 799" },
    { name: "Kagome Australia", contactPerson: "Nathan Price", email: "orders@kagome.com.au", phone: "03 5482 2933", address: "45 Ogilvie Ave", city: "Echuca", state: "VIC", postcode: "3564", paymentTerms: 45, abn: "22 067 966 763" },
    { name: "Lallemand Australia", contactPerson: "Grace Kim", email: "orders@lallemand.com.au", phone: "03 9721 6900", address: "17 Corporate Ave", city: "Rowville", state: "VIC", postcode: "3178", paymentTerms: 30, abn: "39 006 998 476" },
    { name: "Detmold Group", contactPerson: "Liam O'Connor", email: "orders@detmold.com", phone: "08 8168 5000", address: "111 King William St", city: "Adelaide", state: "SA", postcode: "5000", paymentTerms: 30, abn: "78 007 132 671" },
  ]

  const supplierByName: Record<string, string> = {}
  for (const s of mfgSupplierData) {
    const supplier = await prisma.supplier.create({
      data: {
        name: s.name,
        abn: s.abn,
        contactPerson: s.contactPerson,
        email: s.email,
        phone: s.phone,
        address: s.address,
        city: s.city,
        state: s.state,
        postcode: s.postcode,
        paymentTerms: s.paymentTerms,
        status: "active",
        companyId: rdmMfg.id,
      },
    })
    supplierByName[s.name] = supplier.id
  }
  console.log(`✅ Created ${mfgSupplierData.length} ingredient/packaging suppliers`)

  // Link each raw material to its supplier
  for (const rm of rawMaterials) {
    await prisma.productSupplier.create({
      data: {
        productId: rawMaterialProducts[rm.sku].id,
        supplierId: supplierByName[rm.supplier],
        costPrice: rm.costPrice,
        minOrderQty: 10,
        leadTime: rm.supplier === "Kagome Australia" ? 14 : 7,
        isPreferred: true,
      },
    })
  }

  // Purchase orders for raw materials, in varying states of fulfillment
  const poStatuses = ["submitted", "confirmed", "partial", "received", "received"]
  let poIndex = 0
  for (const rm of rawMaterials) {
    poIndex += 1
    const qty = Math.floor(Math.random() * 20) + 10
    const unitCost = rm.costPrice
    const lineTotal = qty * unitCost
    const tax = lineTotal * 0.1
    const status = poStatuses[poIndex % poStatuses.length]
    await prisma.purchaseOrder.create({
      data: {
        poNumber: `RDM-PO-2026-${String(2000 + poIndex).padStart(4, "0")}`,
        supplierId: supplierByName[rm.supplier],
        warehouseId: mfgWarehouse.id,
        orderDate: new Date(Date.now() - Math.random() * 45 * 24 * 60 * 60 * 1000),
        expectedDate: new Date(Date.now() + Math.random() * 14 * 24 * 60 * 60 * 1000),
        subtotal: lineTotal,
        taxAmount: tax,
        totalAmount: lineTotal + tax,
        status,
        companyId: rdmMfg.id,
        items: {
          create: [
            {
              productId: rawMaterialProducts[rm.sku].id,
              quantity: qty,
              receivedQty: status === "received" ? qty : status === "partial" ? Math.floor(qty / 2) : 0,
              unitCost,
              taxRate: 10.0,
              taxAmount: tax,
              total: lineTotal + tax,
            },
          ],
        },
      },
    })
  }
  console.log("✅ Created raw-material purchase orders")

  // Foodservice customers: distributors, independent restaurants, a small
  // multi-venue group (parent + locations), catering and hospitality
  const nonnasParent = await prisma.customer.create({
    data: {
      name: "Nonna's Kitchen Restaurant Group",
      contactPerson: "Giulia Conti",
      email: "accounts@nonnaskitchen.com.au",
      phone: "07 3221 4000",
      creditLimit: 40000,
      paymentTerms: 30,
      priceListId: foodservicePriceList.id,
      customerType: "wholesale",
      industry: "Restaurant Group",
      status: "active",
      creditStatus: "active",
      companyId: rdmMfg.id,
    },
  })
  const nonnasChildren = await Promise.all(
    [
      { name: "Nonna's Kitchen - Fortitude Valley", city: "Fortitude Valley", postcode: "4006" },
      { name: "Nonna's Kitchen - West End", city: "West End", postcode: "4101" },
    ].map(loc =>
      prisma.customer.create({
        data: {
          name: loc.name,
          contactPerson: "Giulia Conti",
          phone: "07 3221 4000",
          creditLimit: 15000,
          paymentTerms: 30,
          priceListId: foodservicePriceList.id,
          customerType: "wholesale",
          industry: "Restaurant Group",
          status: "active",
          creditStatus: "active",
          parentId: nonnasParent.id,
          companyId: rdmMfg.id,
        },
      })
    )
  )
  for (const child of nonnasChildren) {
    await prisma.customerLocation.create({
      data: {
        customerId: child.id,
        label: "Restaurant",
        address: "Shop 3, Village Precinct",
        city: child.name.includes("Fortitude") ? "Fortitude Valley" : "West End",
        state: "QLD",
        postcode: child.name.includes("Fortitude") ? "4006" : "4101",
        isBilling: true,
        isShipping: true,
        isDefault: true,
      },
    })
  }
  console.log("✅ Created Nonna's Kitchen Restaurant Group (parent + 2 venues)")

  const mfgCustomerData = [
    {
      name: "PFD Food Services",
      contactPerson: "Warren Blake",
      email: "purchasing@pfdfoods.com.au",
      phone: "1300 728 315",
      creditLimit: 300000,
      paymentTerms: 30,
      industry: "Foodservice Distributor",
      priceListId: distributorPriceList.id,
      locations: [{ label: "Distribution Centre", address: "42 Bessemer St", city: "Blacktown", state: "NSW", postcode: "2148", isBilling: true, isShipping: true, isDefault: true }],
    },
    {
      name: "Bidfood Australia",
      contactPerson: "Louise Fraser",
      email: "orders@bidfood.com.au",
      phone: "1800 088 715",
      creditLimit: 250000,
      paymentTerms: 30,
      industry: "Foodservice Distributor",
      priceListId: distributorPriceList.id,
      locations: [{ label: "Distribution Centre", address: "8 Distribution Drive", city: "Laverton North", state: "VIC", postcode: "3026", isBilling: true, isShipping: true, isDefault: true }],
    },
    {
      name: "Bella Napoli Pizzeria",
      contactPerson: "Marco Esposito",
      email: "marco@bellanapoli.com.au",
      phone: "02 9550 1122",
      creditLimit: 8000,
      paymentTerms: 14,
      industry: "Restaurant",
      priceListId: foodservicePriceList.id,
      locations: [{ label: "Restaurant", address: "112 King St", city: "Newtown", state: "NSW", postcode: "2042", isBilling: true, isShipping: true, isDefault: true }],
    },
    {
      name: "Tony's Trattoria",
      contactPerson: "Tony Falcone",
      email: "tony@tonystrattoria.com.au",
      phone: "03 9417 5566",
      creditLimit: 6000,
      paymentTerms: 14,
      industry: "Restaurant",
      priceListId: foodservicePriceList.id,
      locations: [{ label: "Restaurant", address: "58 Brunswick St", city: "Fitzroy", state: "VIC", postcode: "3065", isBilling: true, isShipping: true, isDefault: true }],
    },
    {
      name: "Skyline Catering Services",
      contactPerson: "Priya Nair",
      email: "procurement@skylinecatering.com.au",
      phone: "02 8338 9900",
      creditLimit: 60000,
      paymentTerms: 30,
      industry: "Airline & Event Catering",
      priceListId: distributorPriceList.id,
      locations: [{ label: "Catering Kitchen", address: "22 Airport Ave", city: "Mascot", state: "NSW", postcode: "2020", isBilling: true, isShipping: true, isDefault: true }],
    },
    {
      name: "Coastal Hotels Group",
      contactPerson: "Ryan Doyle",
      email: "supply@coastalhotels.com.au",
      phone: "07 5592 3300",
      creditLimit: 35000,
      paymentTerms: 30,
      industry: "Hospitality Group",
      priceListId: foodservicePriceList.id,
      locations: [
        { label: "Head Office", address: "9 Marine Parade", city: "Gold Coast", state: "QLD", postcode: "4217", isBilling: true, isShipping: false, isDefault: true },
        { label: "Kitchen Store", address: "9 Marine Parade", city: "Gold Coast", state: "QLD", postcode: "4217", isBilling: false, isShipping: true },
      ],
    },
  ]

  const mfgCustomers: string[] = [nonnasParent.id, ...nonnasChildren.map(c => c.id)]
  for (const cust of mfgCustomerData) {
    const customer = await prisma.customer.create({
      data: {
        name: cust.name,
        contactPerson: cust.contactPerson,
        email: cust.email,
        phone: cust.phone,
        creditLimit: cust.creditLimit,
        paymentTerms: cust.paymentTerms,
        priceListId: cust.priceListId,
        industry: cust.industry,
        customerType: "wholesale",
        status: "active",
        creditStatus: "active",
        companyId: rdmMfg.id,
      },
    })
    mfgCustomers.push(customer.id)
    for (const loc of cust.locations) {
      await prisma.customerLocation.create({ data: { customerId: customer.id, ...loc } })
    }
  }
  console.log(`✅ Created ${mfgCustomerData.length} foodservice customers`)

  // Sample sales orders drawn only from finished goods (raw materials aren't sold)
  const mfgProducts = await prisma.product.findMany({ where: { companyId: rdmMfg.id, categoryId: { not: mfgCategoryMap["Raw Materials"] } } })
  const mfgStatuses = ["draft", "approved", "picking", "packed", "dispatched", "delivered", "invoiced"]
  for (let i = 0; i < 15; i++) {
    const customerId = mfgCustomers[Math.floor(Math.random() * mfgCustomers.length)]
    const numItems = Math.floor(Math.random() * 4) + 2
    const selected = [...mfgProducts].sort(() => Math.random() - 0.5).slice(0, numItems)

    let subtotal = 0
    let taxAmount = 0
    const items = selected.map(product => {
      const quantity = Math.floor(Math.random() * 15) + 2
      const lineTotal = product.wholesalePrice * quantity
      const lineTax = lineTotal * (product.gstRate / 100)
      subtotal += lineTotal
      taxAmount += lineTax
      return { productId: product.id, quantity, unitPrice: product.wholesalePrice, taxRate: product.gstRate, taxAmount: lineTax, total: lineTotal + lineTax }
    })

    await prisma.salesOrder.create({
      data: {
        orderNumber: `RDM-SO-2026-${String(3000 + i).padStart(4, "0")}`,
        customerId,
        status: mfgStatuses[Math.floor(Math.random() * mfgStatuses.length)],
        orderDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        subtotal,
        taxAmount,
        totalAmount: subtotal + taxAmount,
        warehouseId: mfgWarehouse.id,
        companyId: rdmMfg.id,
        items: { create: items },
      },
    })
  }
  console.log("✅ Created foodservice sales orders")

  // ============================================================
  // COMPANY 2: RDM Retail Pty Ltd (trading as RDM Pizza Shop)
  // Consumer retail packs sold through grocery/specialty stockists
  // ============================================================
  const rdmRetail = await prisma.company.create({
    data: {
      name: "RDM Retail Pty Ltd",
      tradingName: "RDM Pizza Shop",
      abn: "68 621 344 902",
      acn: "621 344 902",
      phone: "02 8040 2460",
      email: "retail@rdmpizza.com.au",
      website: "www.rdmpizza.com.au/rdm-retail",
      address: "52A Central Hills Drive",
      city: "Gregory Hills",
      state: "NSW",
      postcode: "2557",
      bankName: "Westpac Banking Corporation",
      bsb: "032-451",
      accountNumber: "88221144",
      accountName: "RDM Retail Pty Ltd",
      gstRegistered: true,
      gstRate: 10.0,
      setupComplete: true,
    },
  })
  console.log("✅ Created RDM Retail Pty Ltd")

  await prisma.user.createMany({
    data: [
      { email: "retail-admin@rdmpizza.com.au", name: "Riccardo Moretti", password: hashedPassword, role: "admin", status: "active", phone: "0411 222 333", companyId: rdmRetail.id },
      { email: "retail-sales@rdmpizza.com.au", name: "Chloe Anderson", password: hashedPassword, role: "sales", status: "active", phone: "0466 777 888", companyId: rdmRetail.id },
      { email: "retail-warehouse@rdmpizza.com.au", name: "Jake Wilson", password: hashedPassword, role: "warehouse", status: "active", phone: "0477 888 999", companyId: rdmRetail.id },
    ],
  })
  console.log("✅ Created RDM Retail users")

  const retailWarehouse = await prisma.warehouse.create({
    data: {
      name: "RDM Retail Fulfilment Centre",
      code: "RET-FC",
      location: "Gregory Hills, Sydney",
      address: "52A Central Hills Drive",
      city: "Gregory Hills",
      state: "NSW",
      postcode: "2557",
      contactName: "Jake Wilson",
      contactPhone: "02 8040 2460",
      isDefault: true,
      capacity: 1500,
      companyId: rdmRetail.id,
    },
  })

  const retailCategories = await prisma.category.createMany({
    data: [
      { name: "Frozen Pizza Bases - Retail Pack", description: "Consumer twin-packs for grocery stockists", companyId: rdmRetail.id },
      { name: "Dough Balls - Retail Pack", description: "Consumer multi-packs for grocery stockists", companyId: rdmRetail.id },
      { name: "Specialty - Retail Pack", description: "Piadini consumer packs", companyId: rdmRetail.id },
    ],
  })
  const retailCategoryRows = await prisma.category.findMany({ where: { companyId: rdmRetail.id } })
  const retailCategoryMap = Object.fromEntries(retailCategoryRows.map(c => [c.name, c.id]))

  const retailPriceList = await prisma.priceList.create({
    data: { name: "Retail Stockist Pricing", type: "retail", isDefault: true, status: "active", companyId: rdmRetail.id },
  })

  const retailProducts = [
    { sku: "RDM-R-NAP2PK-12", name: "Napoli Rustica Twin Pack 2x300g (Carton 12)", category: "Frozen Pizza Bases - Retail Pack", wholesalePrice: 42.0, costPrice: 30.0 },
    { sku: "RDM-R-GF2PK-12", name: "Gluten Free Twin Pack 2x280g (Carton 12)", category: "Frozen Pizza Bases - Retail Pack", wholesalePrice: 48.0, costPrice: 35.0 },
    { sku: "RDM-R-DB4PK-12", name: "Dough Balls 4 Pack 4x180g (Carton 12)", category: "Dough Balls - Retail Pack", wholesalePrice: 54.0, costPrice: 39.0 },
    { sku: "RDM-R-PIAD4PK-12", name: "Piadini 4 Pack (Carton 12)", category: "Specialty - Retail Pack", wholesalePrice: 46.0, costPrice: 33.0 },
  ]

  for (const prod of retailProducts) {
    const product = await prisma.product.create({
      data: {
        sku: prod.sku,
        name: prod.name,
        categoryId: retailCategoryMap[prod.category],
        baseUnit: "carton",
        packSize: 12,
        packUnit: "Carton of 12",
        wholesalePrice: prod.wholesalePrice,
        costPrice: prod.costPrice,
        gstRate: 10.0,
        status: "active",
        companyId: rdmRetail.id,
      },
    })
    await prisma.inventory.create({
      data: {
        productId: product.id,
        warehouseId: retailWarehouse.id,
        quantity: Math.floor(Math.random() * 200) + 60,
        reserved: Math.floor(Math.random() * 15),
        reorderLevel: 30,
        reorderQty: 100,
        avgCost: prod.costPrice,
        lastCost: prod.costPrice,
      },
    })
    await prisma.priceListItem.create({ data: { priceListId: retailPriceList.id, productId: product.id, price: prod.wholesalePrice, minQty: 1 } })
  }
  console.log(`✅ Created ${retailProducts.length} retail-pack products`)

  const retailCustomerData = [
    { name: "Harris Farm Markets", contactPerson: "Bianca Lee", email: "buying@harrisfarm.com.au", phone: "02 9670 6000", creditLimit: 60000, paymentTerms: 30, city: "Sydney", state: "NSW", postcode: "2000" },
    { name: "IGA Distribution Pty Ltd", contactPerson: "Steven Cole", email: "orders@iga.com.au", phone: "02 9744 0000", creditLimit: 50000, paymentTerms: 30, city: "Sydney", state: "NSW", postcode: "2148" },
    { name: "Providore Fine Foods", contactPerson: "Anna Wren", email: "orders@providorefinefoods.com.au", phone: "03 9111 2200", creditLimit: 25000, paymentTerms: 30, city: "Melbourne", state: "VIC", postcode: "3000" },
    { name: "Coles Local", contactPerson: "Michael Tran", email: "supplierservices@coles.com.au", phone: "03 9829 3111", creditLimit: 80000, paymentTerms: 45, city: "Melbourne", state: "VIC", postcode: "3000" },
  ]
  const retailCustomers: string[] = []
  for (const cust of retailCustomerData) {
    const customer = await prisma.customer.create({
      data: {
        name: cust.name,
        contactPerson: cust.contactPerson,
        email: cust.email,
        phone: cust.phone,
        creditLimit: cust.creditLimit,
        paymentTerms: cust.paymentTerms,
        priceListId: retailPriceList.id,
        industry: "Grocery Retail",
        customerType: "retail",
        status: "active",
        creditStatus: "active",
        companyId: rdmRetail.id,
      },
    })
    retailCustomers.push(customer.id)
    await prisma.customerLocation.create({
      data: { customerId: customer.id, label: "Distribution Centre", address: "1 Distribution Way", city: cust.city, state: cust.state, postcode: cust.postcode, isBilling: true, isShipping: true, isDefault: true },
    })
  }
  console.log(`✅ Created ${retailCustomerData.length} retail stockist customers`)

  const retailProductRows = await prisma.product.findMany({ where: { companyId: rdmRetail.id } })
  for (let i = 0; i < 8; i++) {
    const customerId = retailCustomers[Math.floor(Math.random() * retailCustomers.length)]
    const numItems = Math.floor(Math.random() * 3) + 1
    const selected = [...retailProductRows].sort(() => Math.random() - 0.5).slice(0, numItems)

    let subtotal = 0
    let taxAmount = 0
    const items = selected.map(product => {
      const quantity = Math.floor(Math.random() * 20) + 5
      const lineTotal = product.wholesalePrice * quantity
      const lineTax = lineTotal * (product.gstRate / 100)
      subtotal += lineTotal
      taxAmount += lineTax
      return { productId: product.id, quantity, unitPrice: product.wholesalePrice, taxRate: product.gstRate, taxAmount: lineTax, total: lineTotal + lineTax }
    })

    await prisma.salesOrder.create({
      data: {
        orderNumber: `RDMR-SO-2026-${String(4000 + i).padStart(4, "0")}`,
        customerId,
        status: mfgStatuses[Math.floor(Math.random() * mfgStatuses.length)],
        orderDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        subtotal,
        taxAmount,
        totalAmount: subtotal + taxAmount,
        warehouseId: retailWarehouse.id,
        companyId: rdmRetail.id,
        items: { create: items },
      },
    })
  }
  console.log("✅ Created retail sales orders")

  // ============================================================
  // COMPANY 3: Super Veloce Pty Ltd
  // Pizza ovens & commercial kitchen equipment
  // ============================================================
  const superVeloce = await prisma.company.create({
    data: {
      name: "Super Veloce Pty Ltd",
      tradingName: "Super Veloce",
      abn: "27 654 321 098",
      acn: "654 321 098",
      phone: "02 8040 2470",
      email: "sales@superveloce.com.au",
      website: "www.superveloce.com.au",
      address: "14 Rider Boulevard",
      city: "Rhodes",
      state: "NSW",
      postcode: "2138",
      bankName: "ANZ Bank",
      bsb: "012-345",
      accountNumber: "55667788",
      accountName: "Super Veloce Pty Ltd",
      gstRegistered: true,
      gstRate: 10.0,
      setupComplete: true,
    },
  })
  console.log("✅ Created Super Veloce Pty Ltd")

  await prisma.user.createMany({
    data: [
      { email: "admin@superveloce.com.au", name: "Riccardo Moretti", password: hashedPassword, role: "admin", status: "active", phone: "0411 222 333", companyId: superVeloce.id },
      { email: "sales@superveloce.com.au", name: "Marco Bianchi", password: hashedPassword, role: "sales", status: "active", phone: "0488 999 111", companyId: superVeloce.id },
      { email: "warehouse@superveloce.com.au", name: "Dean Carter", password: hashedPassword, role: "warehouse", status: "active", phone: "0499 111 222", companyId: superVeloce.id },
    ],
  })
  console.log("✅ Created Super Veloce users")

  const svWarehouse = await prisma.warehouse.create({
    data: {
      name: "Super Veloce Showroom & Depot",
      code: "SV-DEPOT",
      location: "Rhodes, Sydney",
      address: "14 Rider Boulevard",
      city: "Rhodes",
      state: "NSW",
      postcode: "2138",
      contactName: "Dean Carter",
      contactPhone: "02 8040 2470",
      isDefault: true,
      capacity: 200,
      companyId: superVeloce.id,
    },
  })

  const svCategories = await prisma.category.createMany({
    data: [
      { name: "Pizza Ovens", description: "Gas and wood-fired commercial pizza ovens", companyId: superVeloce.id },
      { name: "Pizza Tools", description: "Peels, cutters and hand tools", companyId: superVeloce.id },
      { name: "Commercial Refrigeration", description: "Prep fridges and coolroom equipment", companyId: superVeloce.id },
    ],
  })
  const svCategoryRows = await prisma.category.findMany({ where: { companyId: superVeloce.id } })
  const svCategoryMap = Object.fromEntries(svCategoryRows.map(c => [c.name, c.id]))

  const tradePriceList = await prisma.priceList.create({
    data: { name: "Trade Pricing", type: "wholesale", isDefault: true, status: "active", companyId: superVeloce.id },
  })

  const svProducts = [
    { sku: "SV-OVEN-GAS-1", name: "Super Veloce Gas Fired Pizza Oven - Single Deck", category: "Pizza Ovens", wholesalePrice: 8500.0, costPrice: 6200.0, stock: [2, 6] },
    { sku: "SV-OVEN-WOOD-1", name: "Super Veloce Wood Fired Pizza Oven", category: "Pizza Ovens", wholesalePrice: 14500.0, costPrice: 10800.0, stock: [1, 4] },
    { sku: "SV-PEEL-PERF", name: "Perforated Pizza Peel 12\"", category: "Pizza Tools", wholesalePrice: 65.0, costPrice: 42.0, stock: [15, 40] },
    { sku: "SV-PEEL-WOOD", name: "Wooden Pizza Peel 14\"", category: "Pizza Tools", wholesalePrice: 55.0, costPrice: 36.0, stock: [15, 40] },
    { sku: "SV-DOUGHMIX-20", name: "Commercial Dough Mixer 20L", category: "Pizza Tools", wholesalePrice: 3200.0, costPrice: 2350.0, stock: [2, 8] },
    { sku: "SV-FRIDGE-2DR", name: "Two Door Pizza Prep Fridge", category: "Commercial Refrigeration", wholesalePrice: 4200.0, costPrice: 3100.0, stock: [2, 8] },
  ]

  for (const prod of svProducts) {
    const product = await prisma.product.create({
      data: {
        sku: prod.sku,
        name: prod.name,
        categoryId: svCategoryMap[prod.category],
        baseUnit: "each",
        wholesalePrice: prod.wholesalePrice,
        costPrice: prod.costPrice,
        gstRate: 10.0,
        status: "active",
        companyId: superVeloce.id,
      },
    })
    await prisma.inventory.create({
      data: {
        productId: product.id,
        warehouseId: svWarehouse.id,
        quantity: Math.floor(Math.random() * (prod.stock[1] - prod.stock[0])) + prod.stock[0],
        reserved: 0,
        reorderLevel: 2,
        reorderQty: 5,
        avgCost: prod.costPrice,
        lastCost: prod.costPrice,
      },
    })
    await prisma.priceListItem.create({ data: { priceListId: tradePriceList.id, productId: product.id, price: prod.wholesalePrice, minQty: 1 } })
  }
  console.log(`✅ Created ${svProducts.length} equipment products`)

  const svSupplierData = [
    { name: "Forni Ferrara", contactPerson: "Alessandro Bruno", email: "export@forniferrara.it", phone: "+39 0532 900 100", address: "Via dell'Artigianato 12", city: "Ferrara", state: "", postcode: "44100", paymentTerms: 60 },
    { name: "Coolroom Systems Australia", contactPerson: "Kayla Simmons", email: "sales@coolroomsystems.com.au", phone: "02 9645 8800", address: "27 Enterprise Cct", city: "Wetherill Park", state: "NSW", postcode: "2164", paymentTerms: 30 },
  ]
  const svSupplierByName: Record<string, string> = {}
  for (const s of svSupplierData) {
    const supplier = await prisma.supplier.create({
      data: {
        name: s.name,
        contactPerson: s.contactPerson,
        email: s.email,
        phone: s.phone,
        address: s.address,
        city: s.city,
        state: s.state || undefined,
        postcode: s.postcode,
        paymentTerms: s.paymentTerms,
        status: "active",
        companyId: superVeloce.id,
      },
    })
    svSupplierByName[s.name] = supplier.id
  }
  await prisma.productSupplier.createMany({
    data: [
      { productId: (await prisma.product.findUniqueOrThrow({ where: { sku: "SV-OVEN-GAS-1" } })).id, supplierId: svSupplierByName["Forni Ferrara"], costPrice: 6200.0, minOrderQty: 1, leadTime: 45, isPreferred: true },
      { productId: (await prisma.product.findUniqueOrThrow({ where: { sku: "SV-OVEN-WOOD-1" } })).id, supplierId: svSupplierByName["Forni Ferrara"], costPrice: 10800.0, minOrderQty: 1, leadTime: 60, isPreferred: true },
      { productId: (await prisma.product.findUniqueOrThrow({ where: { sku: "SV-FRIDGE-2DR" } })).id, supplierId: svSupplierByName["Coolroom Systems Australia"], costPrice: 3100.0, minOrderQty: 1, leadTime: 21, isPreferred: true },
    ],
  })
  console.log("✅ Created equipment suppliers")

  const svCustomerData = [
    { name: "Bella Napoli Pizzeria", contactPerson: "Marco Esposito", email: "marco@bellanapoli.com.au", phone: "02 9550 1122", creditLimit: 20000, city: "Newtown", state: "NSW", postcode: "2042" },
    { name: "Tony's Trattoria", contactPerson: "Tony Falcone", email: "tony@tonystrattoria.com.au", phone: "03 9417 5566", creditLimit: 15000, city: "Fitzroy", state: "VIC", postcode: "3065" },
    { name: "New Venue Fitouts Pty Ltd", contactPerson: "Sarah Doan", email: "projects@newvenuefitouts.com.au", phone: "03 9111 4400", creditLimit: 50000, city: "Melbourne", state: "VIC", postcode: "3000" },
    { name: "Woodfire & Co Hospitality Group", contactPerson: "Ben Carroll", email: "procurement@woodfireco.com.au", phone: "07 3221 9900", creditLimit: 35000, city: "Brisbane", state: "QLD", postcode: "4000" },
  ]
  const svCustomers: string[] = []
  for (const cust of svCustomerData) {
    const customer = await prisma.customer.create({
      data: {
        name: cust.name,
        contactPerson: cust.contactPerson,
        email: cust.email,
        phone: cust.phone,
        creditLimit: cust.creditLimit,
        paymentTerms: 30,
        priceListId: tradePriceList.id,
        industry: "Hospitality Equipment",
        customerType: "wholesale",
        status: "active",
        creditStatus: "active",
        companyId: superVeloce.id,
      },
    })
    svCustomers.push(customer.id)
    await prisma.customerLocation.create({
      data: { customerId: customer.id, label: "Delivery Site", address: "Site Address", city: cust.city, state: cust.state, postcode: cust.postcode, isBilling: true, isShipping: true, isDefault: true },
    })
  }
  console.log(`✅ Created ${svCustomerData.length} equipment customers`)

  const svProductRows = await prisma.product.findMany({ where: { companyId: superVeloce.id } })
  const svStatuses = ["draft", "approved", "dispatched", "delivered", "invoiced"]
  for (let i = 0; i < 6; i++) {
    const customerId = svCustomers[Math.floor(Math.random() * svCustomers.length)]
    const product = svProductRows[Math.floor(Math.random() * svProductRows.length)]
    const quantity = product.wholesalePrice > 1000 ? 1 : Math.floor(Math.random() * 3) + 1
    const lineTotal = product.wholesalePrice * quantity
    const lineTax = lineTotal * (product.gstRate / 100)

    await prisma.salesOrder.create({
      data: {
        orderNumber: `SV-SO-2026-${String(5000 + i).padStart(4, "0")}`,
        customerId,
        status: svStatuses[Math.floor(Math.random() * svStatuses.length)],
        orderDate: new Date(Date.now() - Math.random() * 60 * 24 * 60 * 60 * 1000),
        subtotal: lineTotal,
        taxAmount: lineTax,
        totalAmount: lineTotal + lineTax,
        warehouseId: svWarehouse.id,
        companyId: superVeloce.id,
        items: {
          create: [{ productId: product.id, quantity, unitPrice: product.wholesalePrice, taxRate: product.gstRate, taxAmount: lineTax, total: lineTotal + lineTax }],
        },
      },
    })
  }
  console.log("✅ Created equipment sales orders")

  // Note: Setting.key is globally unique and not company-scoped in this schema,
  // so we deliberately don't re-seed defaults here — seed-au.ts already owns them.

  console.log("🎉 RDM Pizza Group seed completed successfully!")
  console.log("   - RDM Manufacturing Pty Ltd (foodservice manufacturing)")
  console.log("   - RDM Retail Pty Ltd (grocery/retail stockists)")
  console.log("   - Super Veloce Pty Ltd (ovens & equipment)")
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
