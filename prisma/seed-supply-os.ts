import { PrismaClient } from "@prisma/client"
import { hash } from "bcryptjs"

const prisma = new PrismaClient()

export async function seedSupplyOs() {
  console.log("🌱 Seeding SupplySure OS (Supply OS) operational data...")

  // 1. Get or update primary Supply OS company
  let company = await prisma.company.findFirst({
    where: {
      OR: [
        { name: { contains: "Fresh Distribution", mode: "insensitive" } },
        { tradingName: { contains: "Supply", mode: "insensitive" } },
        { abn: "51 824 753 419" },
      ],
    },
  })

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: "SupplySure Distribution Pty Ltd",
        tradingName: "SupplySure OS",
        abn: "51 824 753 419",
        acn: "824 753 419",
        phone: "02 9876 5432",
        email: "info@supplysure.com.au",
        website: "www.supplysure.com.au",
        address: "45 Industrial Drive",
        city: "Sydney",
        state: "NSW",
        postcode: "2000",
        bankName: "Westpac Banking Corporation",
        bsb: "032-123",
        accountNumber: "12345678",
        accountName: "SupplySure Distribution Pty Ltd",
        gstRegistered: true,
        gstRate: 10.0,
        setupComplete: true,
      },
    })
  } else {
    company = await prisma.company.update({
      where: { id: company.id },
      data: {
        tradingName: "SupplySure OS",
        website: "www.supplysure.com.au",
        email: "info@supplysure.com.au",
      },
    })
  }

  console.log(`✅ Company configured: ${company.name} (${company.tradingName})`)

  // 2. Users (SupplySure + FreshDist aliases)
  const hashedPassword = await hash("password123", 10)
  const usersToCreate = [
    { email: "admin@supplysure.com.au", name: "Alex Taylor (Admin)", role: "admin", phone: "0412 000 001" },
    { email: "warehouse@supplysure.com.au", name: "Mark Henderson (Floor Lead)", role: "warehouse", phone: "0412 000 002" },
    { email: "driver@supplysure.com.au", name: "Dave Brown (Delivery Fleet)", role: "driver", phone: "0412 000 003" },
    { email: "sales@supplysure.com.au", name: "Sarah Chen (Sales Ops)", role: "sales", phone: "0412 000 004" },
    { email: "accounts@supplysure.com.au", name: "Emma Watson (Finance)", role: "accounts", phone: "0412 000 005" },
    { email: "admin@freshdist.com.au", name: "James Wilson (Admin)", role: "admin", phone: "0412 345 678" },
    { email: "warehouse@freshdist.com.au", name: "Mike Taylor (Warehouse)", role: "warehouse", phone: "0445 678 901" },
    { email: "driver@freshdist.com.au", name: "Dave Brown (Driver)", role: "driver", phone: "0456 789 012" },
  ]

  for (const u of usersToCreate) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: {
        email: u.email,
        name: u.name,
        password: hashedPassword,
        role: u.role,
        status: "active",
        phone: u.phone,
        companyId: company.id,
      },
      update: {
        name: u.name,
        role: u.role,
        status: "active",
        companyId: company.id,
      },
    })
  }
  console.log("✅ Users configured")

  // 3. Warehouses
  const warehouses = [
    { code: "SYD-DC-01", name: "Sydney Distribution Centre", address: "45 Industrial Drive, Chullora NSW 2190" },
    { code: "MEL-DC-02", name: "Melbourne Distribution Centre", address: "12 Logistics Blvd, Altona VIC 3018" },
    { code: "BNE-DC-03", name: "Brisbane Depot", address: "8 Freightway, Heathwood QLD 4110" },
  ]

  const warehouseRecords: Record<string, string> = {}
  for (const wh of warehouses) {
    const existing = await prisma.warehouse.findFirst({
      where: { companyId: company.id, name: wh.name },
    })
    if (existing) {
      warehouseRecords[wh.code] = existing.id
    } else {
      const created = await prisma.warehouse.create({
        data: {
          code: wh.code,
          name: wh.name,
          location: wh.address,
          address: wh.address,
          companyId: company.id,
        },
      })
      warehouseRecords[wh.code] = created.id
    }
  }

  const primaryWarehouseId = warehouseRecords["SYD-DC-01"] || Object.values(warehouseRecords)[0]

  // 4. Suppliers
  const suppliers = [
    { code: "SUPP-COCA", name: "Coca-Cola Amatil", email: "orders@ccamatil.com.au", phone: "13 26 53", terms: 30 },
    { code: "SUPP-MOND", name: "Mondelez Australia", email: "orders@mondelez.com", phone: "1800 033 275", terms: 30 },
    { code: "SUPP-PEPS", name: "PepsiCo Australia", email: "orders@pepsico.com.au", phone: "1800 025 789", terms: 14 },
    { code: "SUPP-ARNT", name: "Arnott's Biscuits", email: "orders@arnotts.com.au", phone: "1800 248 893", terms: 30 },
    { code: "SUPP-BULLA", name: "Bulla Dairy Foods", email: "orders@bulla.com.au", phone: "1800 001 332", terms: 30 },
  ]

  const supplierMap: Record<string, string> = {}
  for (const supp of suppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { companyId: company.id, name: supp.name },
    })
    if (existing) {
      supplierMap[supp.code] = existing.id
    } else {
      const created = await prisma.supplier.create({
        data: {
          name: supp.name,
          email: supp.email,
          phone: supp.phone,
          companyId: company.id,
          paymentTerms: supp.terms,
          status: "active",
        },
      })
      supplierMap[supp.code] = created.id
    }
  }

  // 5. Products check
  const products = await prisma.product.findMany({
    where: { companyId: company.id },
    take: 15,
  })

  if (products.length === 0) {
    console.log("No products found for company, skipping PO lines")
    return
  }

  // 6. Inbound Purchase Orders
  const samplePOs = [
    {
      poNumber: "PO-2026-801",
      supplierId: supplierMap["SUPP-COCA"] || Object.values(supplierMap)[0],
      status: "submitted",
      orderDate: new Date("2026-08-20"),
      expectedDate: new Date("2026-08-24"),
      notes: "Weekly Sydney Distribution Centre replenishment - dock bay 3",
      items: [
        { productIndex: 0, qty: 100, cost: 24.50 },
        { productIndex: 1, qty: 80, cost: 28.00 },
      ],
    },
    {
      poNumber: "PO-2026-802",
      supplierId: supplierMap["SUPP-MOND"] || Object.values(supplierMap)[0],
      status: "confirmed",
      orderDate: new Date("2026-08-21"),
      expectedDate: new Date("2026-08-25"),
      notes: "Confectionery & chocolate bulk drop - temperature controlled 16-18C",
      items: [
        { productIndex: 2 % products.length, qty: 60, cost: 42.00 },
        { productIndex: 3 % products.length, qty: 45, cost: 38.50 },
      ],
    },
    {
      poNumber: "PO-2026-803",
      supplierId: supplierMap["SUPP-PEPS"] || Object.values(supplierMap)[0],
      status: "partial",
      orderDate: new Date("2026-08-18"),
      expectedDate: new Date("2026-08-22"),
      notes: "Chips & snack boxes - partial pallet received on 22 Aug",
      items: [
        { productIndex: 4 % products.length, qty: 120, cost: 18.20, receivedQty: 60 },
        { productIndex: 5 % products.length, qty: 90, cost: 22.00, receivedQty: 45 },
      ],
    },
    {
      poNumber: "PO-2026-804",
      supplierId: supplierMap["SUPP-ARNT"] || Object.values(supplierMap)[0],
      status: "confirmed",
      orderDate: new Date("2026-08-22"),
      expectedDate: new Date("2026-08-26"),
      notes: "Biscuits assortment palletized CHEP",
      items: [
        { productIndex: 6 % products.length, qty: 75, cost: 32.00 },
      ],
    },
    {
      poNumber: "PO-2026-805",
      supplierId: supplierMap["SUPP-BULLA"] || Object.values(supplierMap)[0],
      status: "submitted",
      orderDate: new Date("2026-08-22"),
      expectedDate: new Date("2026-08-24"),
      notes: "Chilled dairy stock 0-4C cold chain compliance mandatory",
      items: [
        { productIndex: 7 % products.length, qty: 50, cost: 48.00 },
        { productIndex: 8 % products.length, qty: 40, cost: 55.00 },
      ],
    },
    {
      poNumber: "PO-2026-806",
      supplierId: supplierMap["SUPP-COCA"] || Object.values(supplierMap)[0],
      status: "received",
      orderDate: new Date("2026-08-15"),
      expectedDate: new Date("2026-08-18"),
      receivedDate: new Date("2026-08-18"),
      notes: "Completed full receipt on dock 1",
      items: [
        { productIndex: 0, qty: 150, cost: 24.50, receivedQty: 150 },
      ],
    },
  ]

  for (const po of samplePOs) {
    const existing = await prisma.purchaseOrder.findFirst({
      where: { poNumber: po.poNumber, companyId: company.id },
    })

    if (!existing) {
      let subtotal = 0
      for (const it of po.items) {
        subtotal += it.qty * it.cost
      }
      const tax = subtotal * 0.10
      const total = subtotal + tax

      const created = await prisma.purchaseOrder.create({
        data: {
          poNumber: po.poNumber,
          companyId: company.id,
          supplierId: po.supplierId,
          warehouseId: primaryWarehouseId,
          status: po.status,
          orderDate: po.orderDate,
          expectedDate: po.expectedDate,
          receivedDate: (po as any).receivedDate || null,
          subtotal,
          taxAmount: tax,
          totalAmount: total,
          notes: po.notes,
        },
      })

      for (const it of po.items) {
        const prod = products[it.productIndex]
        if (!prod) continue
        await prisma.purchaseOrderItem.create({
          data: {
            poId: created.id,
            productId: prod.id,
            quantity: it.qty,
            receivedQty: (it as any).receivedQty || 0,
            unitCost: it.cost,
            total: it.qty * it.cost,
          },
        })
      }
    }
  }
  console.log("✅ Purchase orders seeded")

  // 7. Ensure a few packed orders exist for the dispatch station
  const existingOrders = await prisma.salesOrder.findMany({
    where: { companyId: company.id },
    take: 3,
  })

  for (const ord of existingOrders) {
    if (ord.status !== "packed" && ord.status !== "dispatched") {
      await prisma.salesOrder.update({
        where: { id: ord.id },
        data: { status: "packed" },
      })
    }
  }
  console.log("✅ Dispatch staging orders verified")

  console.log("🎉 SupplySure OS data seeding completed successfully!")
}

if (require.main === module) {
  seedSupplyOs()
    .catch((e) => {
      console.error(e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
