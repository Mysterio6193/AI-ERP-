import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  console.log("📦 Starting Warehouse & Driver Operations Data Seed...")

  const hashedPassword = await hash("password123", 10)

  // 1. Get or Create Company
  let company = await prisma.company.findFirst({
    where: { name: { contains: "RDM" } },
  })

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: "RDM Manufacturing Pty Ltd",
        tradingName: "RDM Pizza Australia",
        abn: "41 615 988 415",
        phone: "02 8040 2459",
        email: "orders@rdmpizza.com.au",
        address: "52A Central Hills Drive",
        city: "Gregory Hills",
        state: "NSW",
        postcode: "2557",
        gstRegistered: true,
        gstRate: 10.0,
      },
    })
  }

  // 2. Ensure Warehouse & Driver Users
  const users = [
    { email: "warehouse@rdmpizza.com.au", name: "Tony Marchetti", role: "warehouse", phone: "0433 444 555" },
    { email: "driver@rdmpizza.com.au", name: "Sam Nguyen", role: "driver", phone: "0455 666 777" },
    { email: "admin@rdmpizza.com.au", name: "Riccardo Moretti", role: "admin", phone: "0411 222 333" },
    { email: "sales@rdmpizza.com.au", name: "Antonio Russo", role: "sales", phone: "0422 333 444" },
  ]

  const userMap: Record<string, string> = {}
  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, name: u.name, companyId: company.id },
      create: {
        email: u.email,
        name: u.name,
        password: hashedPassword,
        role: u.role,
        status: "active",
        phone: u.phone,
        companyId: company.id,
      },
    })
    userMap[u.role] = user.id
  }

  // 3. Ensure Main Sydney Warehouse
  let warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id },
  })

  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        name: "Sydney Central Logistics Hub & Coldstore",
        code: "SYD-MAIN",
        location: "Gregory Hills DC, Sydney",
        address: "52A Central Hills Drive",
        city: "Gregory Hills",
        state: "NSW",
        postcode: "2557",
        contactName: "Tony Marchetti",
        contactPhone: "02 8040 2459",
        isDefault: true,
        capacity: 12000,
        companyId: company.id,
      },
    })
  }

  // 4. Products & Inventory Setup
  const productsData = [
    {
      sku: "PZ-CRUST-12",
      name: "Artisan 12\" Sourdough Pizza Crusts (24pk)",
      baseUnit: "carton",
      packSize: 24,
      costPrice: 28.5,
      wholesalePrice: 48.0,
      storageTemp: "frozen",
      location: "COLD-ROOM-01",
      quantity: 180,
    },
    {
      sku: "PZ-DOUGH-250",
      name: "Snap-Frozen Neapolitan Dough Balls 250g (60pk)",
      baseUnit: "carton",
      packSize: 60,
      costPrice: 32.0,
      wholesalePrice: 58.0,
      storageTemp: "frozen",
      location: "COLD-ROOM-02",
      quantity: 240,
    },
    {
      sku: "CH-MOZZ-5KG",
      name: "Fior di Latte Shredded Mozzarella (5kg Chilled)",
      baseUnit: "bag",
      packSize: 1,
      costPrice: 42.0,
      wholesalePrice: 65.0,
      storageTemp: "chilled",
      location: "COLD-ROOM-01",
      quantity: 95,
    },
    {
      sku: "SAUCE-SAN-10KG",
      name: "San Marzano D.O.P. Crushed Tomatoes (10kg BIB)",
      baseUnit: "box",
      packSize: 1,
      costPrice: 22.0,
      wholesalePrice: 38.5,
      storageTemp: "ambient",
      location: "AISLE-A-01",
      quantity: 310,
    },
    {
      sku: "FL-SEMO-25KG",
      name: "Semolina Rimacinata Pizza Dusting Flour (25kg)",
      baseUnit: "bag",
      packSize: 1,
      costPrice: 26.0,
      wholesalePrice: 42.0,
      storageTemp: "ambient",
      location: "AISLE-B-02",
      quantity: 140,
    },
    {
      sku: "MT-PROSC-1KG",
      name: "Prosciutto di Parma 24M Sliced (1kg Vac-Pack)",
      baseUnit: "pack",
      packSize: 1,
      costPrice: 34.0,
      wholesalePrice: 54.0,
      storageTemp: "chilled",
      location: "COLD-ROOM-02",
      quantity: 65,
    },
    {
      sku: "OIL-EVOO-15L",
      name: "Cold-Pressed Extra Virgin Olive Oil (15L Drum)",
      baseUnit: "drum",
      packSize: 1,
      costPrice: 85.0,
      wholesalePrice: 135.0,
      storageTemp: "ambient",
      location: "AISLE-C-01",
      quantity: 50,
    },
    {
      sku: "PZ-GF-10",
      name: "Gluten-Free Cauliflower Pizza Crusts 10\" (20pk)",
      baseUnit: "carton",
      packSize: 20,
      costPrice: 35.0,
      wholesalePrice: 56.0,
      storageTemp: "frozen",
      location: "COLD-ROOM-01",
      quantity: 80,
    },
    {
      sku: "CH-GORG-1.5KG",
      name: "Gorgonzola Dolce D.O.P. (1.5kg Wheel)",
      baseUnit: "wheel",
      packSize: 1,
      costPrice: 29.0,
      wholesalePrice: 48.0,
      storageTemp: "chilled",
      location: "COLD-ROOM-02",
      quantity: 45,
    },
  ]

  const productMap: Record<string, any> = {}
  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {
        name: p.name,
        costPrice: p.costPrice,
        wholesalePrice: p.wholesalePrice,
        storageTemp: p.storageTemp,
        companyId: company.id,
      },
      create: {
        sku: p.sku,
        name: p.name,
        baseUnit: p.baseUnit,
        packSize: p.packSize,
        costPrice: p.costPrice,
        wholesalePrice: p.wholesalePrice,
        storageTemp: p.storageTemp,
        companyId: company.id,
      },
    })
    productMap[p.sku] = product

    // Inventory
    const inv = await prisma.inventory.upsert({
      where: {
        productId_warehouseId: {
          productId: product.id,
          warehouseId: warehouse.id,
        },
      },
      update: {
        quantity: p.quantity,
        location: p.location,
      },
      create: {
        productId: product.id,
        warehouseId: warehouse.id,
        quantity: p.quantity,
        location: p.location,
        reorderLevel: 25,
        reorderQty: 100,
      },
    })

    // Batch record for Lot Traceability
    await prisma.inventoryBatch.create({
      data: {
        inventoryId: inv.id,
        productId: product.id,
        warehouseId: warehouse.id,
        batchCode: "LOT-20260822",
        quantity: Math.floor(p.quantity * 0.7),
        expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        sourceType: "purchase",
        location: p.location,
      },
    })
  }
  console.log("✅ Seeded products & warehouse inventory")

  // 5. Suppliers & Inbound Purchase Orders
  const suppliersData = [
    { name: "Primo Smallgoods & Cheeses", email: "orders@primo.com.au", phone: "02 9794 8888", terms: 30 },
    { name: "Mutti Italian Tomato Imports", email: "supply@mutti.com.au", phone: "02 8821 5500", terms: 30 },
    { name: "Manildra Flour Mills Australia", email: "grain@manildra.com.au", phone: "02 9956 1234", terms: 14 },
  ]

  const supplierMap: Record<string, any> = {}
  for (const s of suppliersData) {
    let supplier = await prisma.supplier.findFirst({
      where: { name: s.name, companyId: company.id },
    })
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: s.name,
          email: s.email,
          phone: s.phone,
          paymentTerms: s.terms,
          companyId: company.id,
        },
      })
    }
    supplierMap[s.name] = supplier
  }

  // Create Inbound Purchase Orders
  let po1 = await prisma.purchaseOrder.findUnique({ where: { poNumber: "PO-2026-104" } })
  if (!po1) {
    po1 = await prisma.purchaseOrder.create({
      data: {
        poNumber: "PO-2026-104",
        supplierId: supplierMap["Primo Smallgoods & Cheeses"].id,
        warehouseId: warehouse.id,
        companyId: company.id,
        status: "confirmed",
        orderDate: new Date(),
        expectedDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
        totalAmount: 4250.0,
        items: {
          create: [
            {
              productId: productMap["CH-MOZZ-5KG"].id,
              quantity: 50,
              receivedQty: 0,
              unitCost: 42.0,
              total: 2100.0,
            },
            {
              productId: productMap["MT-PROSC-1KG"].id,
              quantity: 25,
              receivedQty: 0,
              unitCost: 34.0,
              total: 850.0,
            },
            {
              productId: productMap["CH-GORG-1.5KG"].id,
              quantity: 20,
              receivedQty: 0,
              unitCost: 29.0,
              total: 580.0,
            },
          ],
        },
      },
    })
  }

  let po2 = await prisma.purchaseOrder.findUnique({ where: { poNumber: "PO-2026-105" } })
  if (!po2) {
    po2 = await prisma.purchaseOrder.create({
      data: {
        poNumber: "PO-2026-105",
        supplierId: supplierMap["Mutti Italian Tomato Imports"].id,
        warehouseId: warehouse.id,
        companyId: company.id,
        status: "partial",
        orderDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        expectedDate: new Date(),
        totalAmount: 3080.0,
        items: {
          create: [
            {
              productId: productMap["SAUCE-SAN-10KG"].id,
              quantity: 80,
              receivedQty: 40,
              unitCost: 22.0,
              total: 1760.0,
            },
            {
              productId: productMap["OIL-EVOO-15L"].id,
              quantity: 15,
              receivedQty: 10,
              unitCost: 85.0,
              total: 1275.0,
            },
          ],
        },
      },
    })
  }
  console.log("✅ Seeded Inbound Purchase Orders")

  // 6. Customers & Locations
  const customersData = [
    {
      name: "Bella Italia Pizzeria",
      contact: "Marco Rossi",
      phone: "0412 888 999",
      address: "142 Crown Street",
      city: "Surry Hills",
      state: "NSW",
      postcode: "2010",
      notes: "Deliver to kitchen loading dock in rear alley. Ring bell.",
      cod: 480.0,
    },
    {
      name: "Criniti's Darling Harbour",
      contact: "Sarah Jenkins",
      phone: "0423 777 666",
      address: "Harbourside Shopping Centre, Level 2",
      city: "Darling Harbour",
      state: "NSW",
      postcode: "2000",
      notes: "Security pass required. Dock bay 4.",
      cod: 0,
    },
    {
      name: "Fratelli Fresh Sydney CBD",
      contact: "David Chen",
      phone: "0434 555 444",
      address: "11 Bridge Street",
      city: "Sydney",
      state: "NSW",
      postcode: "2000",
      notes: "Morning delivery before 11:30 AM lunch rush.",
      cod: 620.0,
    },
    {
      name: "400 Gradi Restaurant Group",
      contact: "Johnny Di Francesco",
      phone: "0445 666 555",
      address: "88 George Street",
      city: "The Rocks",
      state: "NSW",
      postcode: "2000",
      notes: "Strict cold chain. Temperature log must be < 4°C.",
      cod: 0,
    },
    {
      name: "Totti's Bondi Beach",
      contact: "Chef Mike",
      phone: "0456 123 456",
      address: "283 Bondi Road",
      city: "Bondi",
      state: "NSW",
      postcode: "2026",
      notes: "Pallet forklift access available at side gate.",
      cod: 0,
    },
  ]

  const customerMap: Record<string, any> = {}
  for (const c of customersData) {
    let cust = await prisma.customer.findFirst({
      where: { name: c.name, companyId: company.id },
      include: { locations: true },
    })

    if (!cust) {
      cust = await prisma.customer.create({
        data: {
          name: c.name,
          contactPerson: c.contact,
          phone: c.phone,
          email: `${c.name.toLowerCase().replace(/[^a-z]/g, "")}@example.com`,
          companyId: company.id,
          locations: {
            create: {
              label: "Main Restaurant Kitchen",
              address: c.address,
              city: c.city,
              state: c.state,
              postcode: c.postcode,
              contactName: c.contact,
              phone: c.phone,
              deliveryNotes: c.notes,
              isDefault: true,
              isShipping: true,
            },
          },
        },
        include: { locations: true },
      })
    }
    customerMap[c.name] = cust
  }
  console.log("✅ Seeded Customers & Delivery Locations")

  // 7. Sales Orders, Pick Lists, and Staged Dispatches
  let so1 = await prisma.salesOrder.findUnique({ where: { orderNumber: "SO-1082" } })
  if (!so1) {
    so1 = await prisma.salesOrder.create({
      data: {
        orderNumber: "SO-1082",
        customerId: customerMap["Bella Italia Pizzeria"].id,
        warehouseId: warehouse.id,
        companyId: company.id,
        status: "picking",
        orderDate: new Date(),
        requiredDate: new Date(),
        subtotal: 780.0,
        totalAmount: 858.0,
        deliveryInstructions: "Deliver to rear dock",
        items: {
          create: [
            {
              productId: productMap["PZ-CRUST-12"].id,
              quantity: 10,
              pickedQty: 5,
              unitPrice: 48.0,
              total: 480.0,
            },
            {
              productId: productMap["CH-MOZZ-5KG"].id,
              quantity: 4,
              pickedQty: 4,
              unitPrice: 65.0,
              total: 260.0,
            },
            {
              productId: productMap["SAUCE-SAN-10KG"].id,
              quantity: 3,
              pickedQty: 0,
              unitPrice: 38.5,
              total: 115.5,
            },
          ],
        },
      },
    })
  }

  let so2 = await prisma.salesOrder.findUnique({ where: { orderNumber: "SO-1089" } })
  if (!so2) {
    so2 = await prisma.salesOrder.create({
      data: {
        orderNumber: "SO-1089",
        customerId: customerMap["Criniti's Darling Harbour"].id,
        warehouseId: warehouse.id,
        companyId: company.id,
        status: "approved",
        orderDate: new Date(),
        requiredDate: new Date(),
        subtotal: 1240.0,
        totalAmount: 1364.0,
        deliveryInstructions: "Dock Bay 4 pass",
        items: {
          create: [
            {
              productId: productMap["PZ-DOUGH-250"].id,
              quantity: 12,
              pickedQty: 0,
              unitPrice: 58.0,
              total: 696.0,
            },
            {
              productId: productMap["MT-PROSC-1KG"].id,
              quantity: 8,
              pickedQty: 0,
              unitPrice: 54.0,
              total: 432.0,
            },
          ],
        },
      },
    })
  }

  // Staged Packed Order for 3PL Dispatch
  let so3 = await prisma.salesOrder.findUnique({ where: { orderNumber: "SO-1094" } })
  if (!so3) {
    so3 = await prisma.salesOrder.create({
      data: {
        orderNumber: "SO-1094",
        customerId: customerMap["Fratelli Fresh Sydney CBD"].id,
        warehouseId: warehouse.id,
        companyId: company.id,
        status: "packed",
        orderDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        requiredDate: new Date(),
        subtotal: 920.0,
        totalAmount: 1012.0,
        deliveryInstructions: "Morning delivery before 11:30 AM",
        items: {
          create: [
            {
              productId: productMap["PZ-CRUST-12"].id,
              quantity: 8,
              pickedQty: 8,
              unitPrice: 48.0,
              total: 384.0,
            },
            {
              productId: productMap["CH-MOZZ-5KG"].id,
              quantity: 6,
              pickedQty: 6,
              unitPrice: 65.0,
              total: 390.0,
            },
          ],
        },
      },
    })
  }

  // Pallet-scale order for 3PL Linehaul
  let so4 = await prisma.salesOrder.findUnique({ where: { orderNumber: "SO-1098" } })
  if (!so4) {
    so4 = await prisma.salesOrder.create({
      data: {
        orderNumber: "SO-1098",
        customerId: customerMap["Totti's Bondi Beach"].id,
        warehouseId: warehouse.id,
        companyId: company.id,
        status: "packed",
        orderDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
        requiredDate: new Date(),
        subtotal: 2850.0,
        totalAmount: 3135.0,
        deliveryInstructions: "Forklift pallet drop off",
        items: {
          create: [
            {
              productId: productMap["PZ-CRUST-12"].id,
              quantity: 30,
              pickedQty: 30,
              unitPrice: 48.0,
              total: 1440.0,
            },
            {
              productId: productMap["SAUCE-SAN-10KG"].id,
              quantity: 25,
              pickedQty: 25,
              unitPrice: 38.5,
              total: 962.5,
            },
          ],
        },
      },
    })
  }

  // 8. Generate Pick Lists for Orders
  let pick1 = await prisma.pickList.findUnique({ where: { pickNumber: "PK-1021" } })
  if (!pick1) {
    pick1 = await prisma.pickList.create({
      data: {
        pickNumber: "PK-1021",
        orderId: so1.id,
        warehouseId: warehouse.id,
        assignedTo: userMap["warehouse"],
        status: "in_progress",
        startedAt: new Date(),
        items: {
          create: [
            {
              productId: productMap["PZ-CRUST-12"].id,
              requiredQty: 10,
              pickedQty: 5,
              location: "COLD-ROOM-01",
              status: "pending",
            },
            {
              productId: productMap["CH-MOZZ-5KG"].id,
              requiredQty: 4,
              pickedQty: 4,
              location: "COLD-ROOM-01",
              status: "picked",
            },
            {
              productId: productMap["SAUCE-SAN-10KG"].id,
              requiredQty: 3,
              pickedQty: 0,
              location: "AISLE-A-01",
              status: "pending",
            },
          ],
        },
      },
    })
  }

  let pick2 = await prisma.pickList.findUnique({ where: { pickNumber: "PK-1022" } })
  if (!pick2) {
    pick2 = await prisma.pickList.create({
      data: {
        pickNumber: "PK-1022",
        orderId: so2.id,
        warehouseId: warehouse.id,
        assignedTo: userMap["warehouse"],
        status: "pending",
        items: {
          create: [
            {
              productId: productMap["PZ-DOUGH-250"].id,
              requiredQty: 12,
              pickedQty: 0,
              location: "COLD-ROOM-02",
              status: "pending",
            },
            {
              productId: productMap["MT-PROSC-1KG"].id,
              requiredQty: 8,
              pickedQty: 0,
              location: "COLD-ROOM-02",
              status: "pending",
            },
          ],
        },
      },
    })
  }
  console.log("✅ Seeded Pick Lists & Items")

  // 9. Active Delivery Route for Driver
  const routeDate = new Date()
  const routeNumber = `RUN-${routeDate.getFullYear()}${(routeDate.getMonth() + 1).toString().padStart(2, "0")}${routeDate.getDate().toString().padStart(2, "0")}-01`

  const existingRoute = await prisma.deliveryRoute.findFirst({
    where: { routeNumber },
  })

  if (!existingRoute) {
    const route = await prisma.deliveryRoute.create({
      data: {
        routeNumber,
        name: "Sydney Metro & Eastern Suburbs Daily Run",
        routeDate,
        driver: { connect: { id: userMap["driver"] } },
        vehicle: "Hino Chilled Reefer 300 (NSW BZ-49-XY)",
        warehouse: { connect: { id: warehouse.id } },
        company: { connect: { id: company.id } },
        status: "in_progress",
        startTime: new Date(),
        totalStops: 3,
        completedStops: 0,
        totalDistance: 48.5,
        totalWeight: 185.0,
      },
    })

    // Create Deliveries for the Stops
    const del1 = await prisma.delivery.create({
      data: {
        deliveryNumber: "DEL-8801",
        orderId: so1.id,
        customerId: customerMap["Bella Italia Pizzeria"].id,
        locationId: customerMap["Bella Italia Pizzeria"].locations[0].id,
        routeId: route.id,
        driverId: userMap["driver"],
        status: "pending",
        scheduledDate: routeDate,
        sequenceNo: 1,
        codAmount: 480.0,
        codCollected: false,
      },
    })

    const del2 = await prisma.delivery.create({
      data: {
        deliveryNumber: "DEL-8802",
        orderId: so3.id,
        customerId: customerMap["Fratelli Fresh Sydney CBD"].id,
        locationId: customerMap["Fratelli Fresh Sydney CBD"].locations[0].id,
        routeId: route.id,
        driverId: userMap["driver"],
        status: "pending",
        scheduledDate: routeDate,
        sequenceNo: 2,
        codAmount: 620.0,
        codCollected: false,
      },
    })

    const del3 = await prisma.delivery.create({
      data: {
        deliveryNumber: "DEL-8803",
        orderId: so2.id,
        customerId: customerMap["Criniti's Darling Harbour"].id,
        locationId: customerMap["Criniti's Darling Harbour"].locations[0].id,
        routeId: route.id,
        driverId: userMap["driver"],
        status: "pending",
        scheduledDate: routeDate,
        sequenceNo: 3,
        codAmount: 0,
        codCollected: false,
      },
    })
    console.log("✅ Seeded Active Driver Delivery Route & Stops")
  }

  // 10. Recent Stock Movements for Audit Ledger
  await prisma.stockMovement.createMany({
    data: [
      {
        productId: productMap["PZ-CRUST-12"].id,
        warehouseId: warehouse.id,
        type: "in",
        quantity: 100,
        reason: "Inbound Supplier Goods Check-in",
        reference: "PO-2026-103",
        referenceType: "purchase_order",
        userId: userMap["warehouse"],
      },
      {
        productId: productMap["CH-MOZZ-5KG"].id,
        warehouseId: warehouse.id,
        type: "in",
        quantity: 50,
        reason: "Inbound Coldstore Receiving",
        reference: "PO-2026-103",
        referenceType: "purchase_order",
        userId: userMap["warehouse"],
      },
      {
        productId: productMap["SAUCE-SAN-10KG"].id,
        warehouseId: warehouse.id,
        type: "out",
        quantity: -25,
        reason: "Dispatched Order Fulfillment",
        reference: "SO-1077",
        referenceType: "sales_order",
        userId: userMap["warehouse"],
      },
      {
        productId: productMap["PZ-DOUGH-250"].id,
        warehouseId: warehouse.id,
        type: "adjustment",
        quantity: 15,
        reason: "Cycle Count Reconciliation",
        reference: "ADJ-20260822",
        referenceType: "adjustment",
        userId: userMap["warehouse"],
      },
    ],
  })
  console.log("✅ Seeded Stock Movements Ledger")

  console.log("🎉 Warehouse & Driver Operations Data Seed Complete!")
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
