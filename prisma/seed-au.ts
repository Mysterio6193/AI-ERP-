// SupplySure OS - Australian Market Seed Data
import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"

const prisma = new PrismaClient()

export async function seedAu() {
  console.log("🌱 Starting Australian database seed...")

  // Create company
  const company = await prisma.company.create({
    data: {
      name: "Fresh Distribution Co Pty Ltd",
      tradingName: "FreshDist",
      abn: "51 824 753 419",
      acn: "824 753 419",
      phone: "02 9876 5432",
      email: "info@freshdist.com.au",
      website: "www.freshdist.com.au",
      address: "45 Industrial Drive",
      city: "Sydney",
      state: "NSW",
      postcode: "2000",
      bankName: "Westpac Banking Corporation",
      bsb: "032-123",
      accountNumber: "12345678",
      accountName: "Fresh Distribution Co Pty Ltd",
      gstRegistered: true,
      gstRate: 10.0,
      setupComplete: true,
    },
  })
  console.log("✅ Created company")

  // Create default user
  const hashedPassword = await hash("password123", 10)
  const adminUser = await prisma.user.create({
    data: {
      email: "admin@freshdist.com.au",
      name: "James Wilson",
      password: hashedPassword,
      role: "admin",
      status: "active",
      phone: "0412 345 678",
      companyId: company.id,
    },
  })
  
  // Create additional users
  await prisma.user.createMany({
    data: [
      {
        email: "sales@freshdist.com.au",
        name: "Sarah Chen",
        password: hashedPassword,
        role: "sales",
        status: "active",
        phone: "0423 456 789",
        companyId: company.id,
      },
      {
        email: "warehouse@freshdist.com.au",
        name: "Mike Thompson",
        password: hashedPassword,
        role: "warehouse",
        status: "active",
        phone: "0434 567 890",
        companyId: company.id,
      },
      {
        email: "accounts@freshdist.com.au",
        name: "Lisa Wong",
        password: hashedPassword,
        role: "accounts",
        status: "active",
        phone: "0445 678 901",
        companyId: company.id,
      },
      {
        email: "driver@freshdist.com.au",
        name: "Dave Brown",
        password: hashedPassword,
        role: "driver",
        status: "active",
        phone: "0456 789 012",
        companyId: company.id,
      },
    ],
  })
  console.log("✅ Created users")

  // Create warehouses
  const warehouseSydney = await prisma.warehouse.create({
    data: {
      name: "Sydney Distribution Centre",
      code: "SYD-DC",
      location: "Sydney Metro",
      address: "45 Industrial Drive",
      city: "Sydney",
      state: "NSW",
      postcode: "2000",
      contactName: "Mike Thompson",
      contactPhone: "02 9876 5433",
      isDefault: true,
      capacity: 5000,
      companyId: company.id,
    },
  })

  const warehouseMelbourne = await prisma.warehouse.create({
    data: {
      name: "Melbourne Distribution Centre",
      code: "MEL-DC",
      location: "Melbourne Metro",
      address: "78 Logistics Way",
      city: "Melbourne",
      state: "VIC",
      postcode: "3000",
      contactName: "John Smith",
      contactPhone: "03 8765 4321",
      isDefault: false,
      capacity: 3500,
      companyId: company.id,
    },
  })

  const warehouseBrisbane = await prisma.warehouse.create({
    data: {
      name: "Brisbane Depot",
      code: "BNE-DP",
      location: "Brisbane Metro",
      address: "23 Transport Street",
      city: "Brisbane",
      state: "QLD",
      postcode: "4000",
      contactName: "Peter Jones",
      contactPhone: "07 3456 7890",
      isDefault: false,
      capacity: 2000,
      companyId: company.id,
    },
  })
  console.log("✅ Created warehouses")

  // Create categories
  const categories = await prisma.category.createMany({
    data: [
      { name: "Beverages", description: "Soft drinks, juices, water", companyId: company.id },
      { name: "Confectionery", description: "Chocolate, lollies, sweets", companyId: company.id },
      { name: "Snacks", description: "Chips, crackers, nuts", companyId: company.id },
      { name: "Dairy", description: "Milk, cheese, yoghurt", companyId: company.id },
      { name: "Frozen Foods", description: "Ice cream, frozen meals", companyId: company.id },
      { name: "Grocery", description: "General grocery items", companyId: company.id },
      { name: "Personal Care", description: "Health and beauty products", companyId: company.id },
      { name: "Household", description: "Cleaning and household items", companyId: company.id },
      { name: "Tobacco", description: "Tobacco products", companyId: company.id },
      { name: "Fresh Food", description: "Fresh produce and bakery", companyId: company.id },
    ],
  })
  console.log("✅ Created categories")

  const allCategories = await prisma.category.findMany({ where: { companyId: company.id } })
  const categoryMap = Object.fromEntries(allCategories.map(c => [c.name, c.id]))

  // Create price lists
  const wholesalePriceList = await prisma.priceList.create({
    data: {
      name: "Wholesale Standard",
      type: "wholesale",
      isDefault: true,
      status: "active",
      companyId: company.id,
    },
  })

  const retailPriceList = await prisma.priceList.create({
    data: {
      name: "Retail Pricing",
      type: "retail",
      isDefault: false,
      status: "active",
      companyId: company.id,
    },
  })
  console.log("✅ Created price lists")

  // Create products (Australian market)
  const productData = [
    { sku: "COCA-CAN-24", name: "Coca-Cola Can 375ml (Carton 24)", category: "Beverages", baseUnit: "carton", wholesalePrice: 28.50, costPrice: 22.00, gstExempt: false },
    { sku: "COCA-BOT-24", name: "Coca-Cola Bottle 600ml (Carton 24)", category: "Beverages", baseUnit: "carton", wholesalePrice: 38.00, costPrice: 29.50, gstExempt: false },
    { sku: "SPRITE-CAN-24", name: "Sprite Can 375ml (Carton 24)", category: "Beverages", baseUnit: "carton", wholesalePrice: 28.50, costPrice: 22.00, gstExempt: false },
    { sku: "WATER-600-24", name: "Mount Franklin Water 600ml (Carton 24)", category: "Beverages", baseUnit: "carton", wholesalePrice: 18.00, costPrice: 13.50, gstExempt: false },
    { sku: "JUICE-OJ-12", name: "Daily Juice Orange 2L (Carton 12)", category: "Beverages", baseUnit: "carton", wholesalePrice: 42.00, costPrice: 32.00, gstExempt: false },
    
    { sku: "CADB-DC-48", name: "Cadbury Dairy Milk 50g (Box 48)", category: "Confectionery", baseUnit: "box", wholesalePrice: 72.00, costPrice: 54.00, gstExempt: false },
    { sku: "MARS-BOX-48", name: "Mars Bar 53g (Box 48)", category: "Confectionery", baseUnit: "box", wholesalePrice: 86.00, costPrice: 65.00, gstExempt: false },
    { sku: "SNICK-BOX-48", name: "Snickers Bar 50g (Box 48)", category: "Confectionery", baseUnit: "box", wholesalePrice: 86.00, costPrice: 65.00, gstExempt: false },
    { sku: "LINDT-BALL-30", name: "Lindt Lindor Balls 200g (Carton 30)", category: "Confectionery", baseUnit: "carton", wholesalePrice: 165.00, costPrice: 125.00, gstExempt: false },
    
    { sku: "SMITHS-ORG-16", name: "Smiths Original Chips 175g (Carton 16)", category: "Snacks", baseUnit: "carton", wholesalePrice: 48.00, costPrice: 36.00, gstExempt: false },
    { sku: "THINS-ORG-16", name: "Thins Original 175g (Carton 16)", category: "Snacks", baseUnit: "carton", wholesalePrice: 44.00, costPrice: 33.00, gstExempt: false },
    { sku: "DORITOS-CH-12", name: "Doritos Cheese 170g (Carton 12)", category: "Snacks", baseUnit: "carton", wholesalePrice: 42.00, costPrice: 32.00, gstExempt: false },
    { sku: "PRINGLES-OR-12", name: "Pringles Original 134g (Carton 12)", category: "Snacks", baseUnit: "carton", wholesalePrice: 52.00, costPrice: 40.00, gstExempt: false },
    
    { sku: "PAULS-FULL-12", name: "Pauls Full Cream Milk 2L (Carton 12)", category: "Dairy", baseUnit: "carton", wholesalePrice: 36.00, costPrice: 28.00, gstExempt: false },
    { sku: "DEVONDALE-12", name: "Devondale Milk 1L (Carton 12)", category: "Dairy", baseUnit: "carton", wholesalePrice: 28.00, costPrice: 21.00, gstExempt: false },
    { sku: "BEGA-500", name: "Bega Peanut Butter 500g (Carton 12)", category: "Grocery", baseUnit: "carton", wholesalePrice: 54.00, costPrice: 42.00, gstExempt: false },
    
    { sku: "STREETS-IC-8", name: "Streets Blue Ribbon 2L (Carton 8)", category: "Frozen Foods", baseUnit: "carton", wholesalePrice: 72.00, costPrice: 56.00, gstExempt: false },
    { sku: "PETERS-IC-8", name: "Peters Original 2L (Carton 8)", category: "Frozen Foods", baseUnit: "carton", wholesalePrice: 68.00, costPrice: 52.00, gstExempt: false },
    
    { sku: "KLEENEX-36", name: "Kleenex Tissues 200pk (Carton 36)", category: "Household", baseUnit: "carton", wholesalePrice: 90.00, costPrice: 68.00, gstExempt: false },
    { sku: "SORBENT-24", name: "Sorbent Toilet Paper 12pk (Carton 24)", category: "Household", baseUnit: "carton", wholesalePrice: 96.00, costPrice: 72.00, gstExempt: false },
    { sku: "DOMESTOS-6", name: "Domestos Bleach 2L (Carton 6)", category: "Household", baseUnit: "carton", wholesalePrice: 36.00, costPrice: 27.00, gstExempt: false },
    { sku: "GLAD-TOP-12", name: "Glad Snap Lock Bags Medium (Carton 12)", category: "Household", baseUnit: "carton", wholesalePrice: 42.00, costPrice: 32.00, gstExempt: false },
    
    { sku: "COLGATE-36", name: "Colgate Total 110g (Carton 36)", category: "Personal Care", baseUnit: "carton", wholesalePrice: 72.00, costPrice: 54.00, gstExempt: false },
    { sku: "ORALB-24", name: "Oral-B Toothbrush Medium (Carton 24)", category: "Personal Care", baseUnit: "carton", wholesalePrice: 48.00, costPrice: 36.00, gstExempt: false },
    { sku: "HEADSHOUL-12", name: "Head & Shoulders 400ml (Carton 12)", category: "Personal Care", baseUnit: "carton", wholesalePrice: 78.00, costPrice: 60.00, gstExempt: false },
    
    { sku: "VEGEMITE-12", name: "Vegemite 400g (Carton 12)", category: "Grocery", baseUnit: "carton", wholesalePrice: 54.00, costPrice: 42.00, gstExempt: false },
    { sku: "HEINZ-BEANS-24", name: "Heinz Baked Beans 420g (Carton 24)", category: "Grocery", baseUnit: "carton", wholesalePrice: 48.00, costPrice: 36.00, gstExempt: false },
    { sku: "KELLOGGS-COR-12", name: "Kelloggs Corn Flakes 825g (Carton 12)", category: "Grocery", baseUnit: "carton", wholesalePrice: 72.00, costPrice: 55.00, gstExempt: false },
    { sku: "SANITARIUM-12", name: "Weet-Bix 1.2kg (Carton 12)", category: "Grocery", baseUnit: "carton", wholesalePrice: 84.00, costPrice: 64.00, gstExempt: false },
    { sku: "ARNOTTS-TIM-24", name: "Arnotts Tim Tam Original 200g (Carton 24)", category: "Grocery", baseUnit: "carton", wholesalePrice: 96.00, costPrice: 74.00, gstExempt: false },
    { sku: "ARNOTTS-ASS-24", name: "Arnotts Assorted Creams 250g (Carton 24)", category: "Grocery", baseUnit: "carton", wholesalePrice: 84.00, costPrice: 64.00, gstExempt: false },
  ]

  for (const prod of productData) {
    const product = await prisma.product.create({
      data: {
        sku: prod.sku,
        name: prod.name,
        categoryId: categoryMap[prod.category],
        baseUnit: prod.baseUnit,
        wholesalePrice: prod.wholesalePrice,
        costPrice: prod.costPrice,
        gstRate: prod.gstExempt ? 0 : 10.0,
        gstExempt: prod.gstExempt,
        status: "active",
        companyId: company.id,
      },
    })

    // Create inventory for each warehouse
    for (const warehouse of [warehouseSydney, warehouseMelbourne, warehouseBrisbane]) {
      const quantity = Math.floor(Math.random() * 500) + 50
      await prisma.inventory.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: quantity,
          reserved: Math.floor(Math.random() * 20),
          reorderLevel: 30,
          reorderQty: 100,
          avgCost: prod.costPrice,
          lastCost: prod.costPrice,
        },
      })
    }

    // Add to price list
    await prisma.priceListItem.create({
      data: {
        priceListId: wholesalePriceList.id,
        productId: product.id,
        price: prod.wholesalePrice,
        minQty: 1,
      },
    })
  }
  console.log(`✅ Created ${productData.length} products`)

  // Create suppliers
  const suppliers = await prisma.supplier.createMany({
    data: [
      {
        name: "Coca-Cola Amatil",
        tradingName: "CCA",
        abn: "55 004 139 797",
        contactPerson: "David Miller",
        email: "orders@ccamatil.com.au",
        phone: "1300 651 111",
        address: "71 Leh Rd",
        city: "North Sydney",
        state: "NSW",
        postcode: "2060",
        paymentTerms: 30,
        status: "active",
        companyId: company.id,
      },
      {
        name: "Mondelez Australia",
        tradingName: "Mondelez",
        abn: "51 003 717 431",
        contactPerson: "Jennifer Lee",
        email: "orders@mondelez.com",
        phone: "1800 033 275",
        address: "245 Foote St",
        city: "Melbourne",
        state: "VIC",
        postcode: "3000",
        paymentTerms: 45,
        status: "active",
        companyId: company.id,
      },
      {
        name: "PepsiCo Australia",
        abn: "38 004 545 084",
        contactPerson: "Robert Chen",
        email: "orders@pepsico.com.au",
        phone: "1800 675 476",
        address: "16 Parkview St",
        city: "Sydney",
        state: "NSW",
        postcode: "2113",
        paymentTerms: 30,
        status: "active",
        companyId: company.id,
      },
      {
        name: "Arnott's Biscuits",
        abn: "45 000 019 964",
        contactPerson: "Sarah Thompson",
        email: "orders@arnotts.com.au",
        phone: "1800 677 852",
        address: "24 George St",
        city: "Sydney",
        state: "NSW",
        postcode: "2000",
        paymentTerms: 30,
        status: "active",
        companyId: company.id,
      },
    ],
  })
  console.log("✅ Created suppliers")

  // Create customers (Australian businesses)
  const customerData = [
    {
      name: "Woolworths Metro",
      tradingName: "Woolworths",
      abn: "88 000 014 675",
      contactPerson: "Michael Brown",
      email: "purchasing@woolworths.com.au",
      phone: "02 8885 0000",
      creditLimit: 500000,
      paymentTerms: 30,
      priceListId: wholesalePriceList.id,
      locations: [
        { label: "Head Office", address: "1 Woolworths Way", city: "Sydney", state: "NSW", postcode: "2000", isBilling: true, isShipping: false, isDefault: true },
        { label: "Distribution Centre", address: "125 Barrgar Rd", city: "Sydney", state: "NSW", postcode: "2164", isBilling: false, isShipping: true },
      ],
    },
    {
      name: "Coles Group Limited",
      tradingName: "Coles",
      abn: "19 000 028 481",
      contactPerson: "Amanda Chen",
      email: "supplierservices@coles.com.au",
      phone: "03 9829 3111",
      creditLimit: 750000,
      paymentTerms: 45,
      priceListId: wholesalePriceList.id,
      locations: [
        { label: "Head Office", address: "800 Toorak Rd", city: "Melbourne", state: "VIC", postcode: "3000", isBilling: true, isShipping: false, isDefault: true },
        { label: "Distribution Centre", address: "350 Centre Rd", city: "Melbourne", state: "VIC", postcode: "3168", isBilling: false, isShipping: true },
      ],
    },
    {
      name: "IGA Distribution Pty Ltd",
      tradingName: "IGA",
      abn: "11 004 489 642",
      contactPerson: "John Smith",
      email: "orders@iga.com.au",
      phone: "02 9744 0000",
      creditLimit: 250000,
      paymentTerms: 30,
      priceListId: wholesalePriceList.id,
      locations: [
        { label: "Distribution Centre", address: "55 Rogers St", city: "Sydney", state: "NSW", postcode: "2148", isBilling: true, isShipping: true, isDefault: true },
      ],
    },
    {
      name: "7-Eleven Stores Pty Ltd",
      tradingName: "7-Eleven",
      abn: "68 007 259 589",
      contactPerson: "David Wilson",
      email: "merchandise@7eleven.com.au",
      phone: "03 9518 7777",
      creditLimit: 150000,
      paymentTerms: 14,
      priceListId: retailPriceList.id,
      locations: [
        { label: "Head Office", address: "636 Church St", city: "Melbourne", state: "VIC", postcode: "3000", isBilling: true, isShipping: false, isDefault: true },
      ],
    },
    {
      name: "Bunnings Group Limited",
      tradingName: "Bunnings",
      abn: "41 008 683 388",
      contactPerson: "Sarah Johnson",
      email: "suppliers@bunnings.com.au",
      phone: "03 8823 4000",
      creditLimit: 200000,
      paymentTerms: 30,
      priceListId: wholesalePriceList.id,
      locations: [
        { label: "Head Office", address: "16-18 Cato St", city: "Melbourne", state: "VIC", postcode: "3121", isBilling: true, isShipping: false, isDefault: true },
        { label: "Distribution Centre", address: "250 Hammond Rd", city: "Melbourne", state: "VIC", postcode: "3175", isBilling: false, isShipping: true },
      ],
    },
    {
      name: "FoodWorks",
      tradingName: "FoodWorks",
      abn: "97 008 542 876",
      contactPerson: "Lisa Thompson",
      email: "orders@foodworks.com.au",
      phone: "03 9645 4000",
      creditLimit: 100000,
      paymentTerms: 30,
      priceListId: wholesalePriceList.id,
      locations: [
        { label: "Distribution Centre", address: "421 Victoria St", city: "Melbourne", state: "VIC", postcode: "3000", isBilling: true, isShipping: true, isDefault: true },
      ],
    },
    {
      name: "Independent Grocers Network",
      tradingName: "IGN",
      abn: "82 001 235 789",
      contactPerson: "Peter Lee",
      email: "purchasing@ign.com.au",
      phone: "07 3252 1000",
      creditLimit: 120000,
      paymentTerms: 30,
      priceListId: wholesalePriceList.id,
      locations: [
        { label: "Distribution Centre", address: "45 Boundary Rd", city: "Brisbane", state: "QLD", postcode: "4000", isBilling: true, isShipping: true, isDefault: true },
      ],
    },
    {
      name: "Drakes Supermarkets",
      tradingName: "Drakes",
      abn: "67 009 185 432",
      contactPerson: "Roger Drake",
      email: "orders@drakes.com.au",
      phone: "07 3367 1000",
      creditLimit: 80000,
      paymentTerms: 30,
      priceListId: wholesalePriceList.id,
      locations: [
        { label: "Head Office", address: "31 Franklin St", city: "Brisbane", state: "QLD", postcode: "4000", isBilling: true, isShipping: false, isDefault: true },
        { label: "Distribution Centre", address: "719 Nudgee Rd", city: "Brisbane", state: "QLD", postcode: "4014", isBilling: false, isShipping: true },
      ],
    },
  ]

  for (const cust of customerData) {
    const customer = await prisma.customer.create({
      data: {
        name: cust.name,
        tradingName: cust.tradingName,
        abn: cust.abn,
        contactPerson: cust.contactPerson,
        email: cust.email,
        phone: cust.phone,
        creditLimit: cust.creditLimit,
        paymentTerms: cust.paymentTerms,
        priceListId: cust.priceListId,
        status: "active",
        creditStatus: "active",
        customerType: "wholesale",
        companyId: company.id,
      },
    })

    for (const loc of cust.locations) {
      await prisma.customerLocation.create({
        data: {
          customerId: customer.id,
          label: loc.label,
          address: loc.address,
          city: loc.city,
          state: loc.state,
          postcode: loc.postcode,
          isBilling: loc.isBilling,
          isShipping: loc.isShipping,
          isDefault: loc.isDefault,
        },
      })
    }
  }
  console.log(`✅ Created ${customerData.length} customers`)

  // Create sample sales orders
  const allProducts = await prisma.product.findMany({ where: { companyId: company.id } })
  const allCustomers = await prisma.customer.findMany({ where: { companyId: company.id } })

  for (let i = 0; i < 15; i++) {
    const customer = allCustomers[Math.floor(Math.random() * allCustomers.length)]
    const orderNumber = `SO-2024-${String(1000 + i).padStart(4, "0")}`
    
    // Select random products for this order
    const numItems = Math.floor(Math.random() * 5) + 2
    const selectedProducts = [...allProducts]
      .sort(() => Math.random() - 0.5)
      .slice(0, numItems)

    let subtotal = 0
    let taxAmount = 0
    const items: any[] = []

    for (const product of selectedProducts) {
      const quantity = Math.floor(Math.random() * 10) + 1
      const unitPrice = product.wholesalePrice
      const lineTotal = unitPrice * quantity
      const lineTax = lineTotal * (product.gstRate / 100)
      
      items.push({
        productId: product.id,
        quantity,
        unitPrice,
        taxRate: product.gstRate,
        taxAmount: lineTax,
        total: lineTotal + lineTax,
      })
      
      subtotal += lineTotal
      taxAmount += lineTax
    }

    const totalAmount = subtotal + taxAmount
    const statuses = ["draft", "approved", "picking", "packed", "dispatched", "delivered", "invoiced"]
    const status = statuses[Math.floor(Math.random() * statuses.length)]

    const order = await prisma.salesOrder.create({
      data: {
        orderNumber,
        customerId: customer.id,
        status,
        orderDate: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
        subtotal,
        taxAmount,
        totalAmount,
        warehouseId: warehouseSydney.id,
        companyId: company.id,
        items: {
          create: items,
        },
      },
    })
  }
  console.log("✅ Created sample sales orders")

  // Create settings
  await prisma.setting.createMany({
    data: [
      { key: "default_warehouse", value: warehouseSydney.id },
      { key: "default_payment_terms", value: "30" },
      { key: "default_gst_rate", value: "10" },
      { key: "order_number_prefix", value: "SO" },
      { key: "quote_number_prefix", value: "QT" },
      { key: "invoice_number_prefix", value: "INV" },
      { key: "po_number_prefix", value: "PO" },
    ],
  })
  console.log("✅ Created settings")

  console.log("🎉 Australian database seed completed successfully!")
}

if (require.main === module) {
  seedAu()
    .catch((e) => {
      console.error("❌ Seed failed:", e)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
