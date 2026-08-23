// Third-party carriers and their service areas.
//
// Models how a Sydney food manufacturer actually ships: a refrigerated metro
// courier for local runs, a regional line-haul for country NSW, and an
// interstate carrier for everything else. Each takes its booking in a different
// shape, which is the point - the form is data, not code.
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function seedCarriers() {
  console.log("🚚 Seeding carriers...")

  const company = await prisma.company.findFirst({
    where: {
      OR: [
        { tradingName: { contains: "Supply", mode: "insensitive" } },
        { name: { contains: "Supply", mode: "insensitive" } },
        { name: { contains: "Fresh", mode: "insensitive" } },
      ],
    },
    select: { id: true },
  }) ?? await prisma.company.findFirst({ select: { id: true } })

  const companyId = company?.id ?? null

  // ---- Metro courier: refrigerated, same-day, takes a compact email ----
  const metro = await prisma.carrier.create({
    data: {
      name: "ColdLine Metro Couriers",
      tradingName: "ColdLine",
      abn: "62 118 245 901",
      contactName: "Dispatch Desk",
      email: "ops@coldlinemetro.com.au",
      phone: "02 9755 4400",
      bookingMethod: "email",
      bookingEmail: "bookings@coldlinemetro.com.au",
      cutoffTime: "14:00",
      accountNumber: "RDM-CL-4471",
      companyId,
      formSchemaJson: JSON.stringify([
        { key: "account", label: "Account", default: "RDM-CL-4471", required: true },
        { key: "reference", label: "Reference", source: "order.number", required: true },
        { key: "pickupAddress", label: "Pickup", source: "sender.address", required: true },
        { key: "deliveryName", label: "Deliver to", source: "customer.name", required: true },
        { key: "deliveryAddress", label: "Address", source: "delivery.address", required: true },
        { key: "deliverySuburb", label: "Suburb", source: "delivery.city", required: true },
        { key: "deliveryPostcode", label: "Postcode", source: "delivery.postcode", required: true },
        { key: "contactPhone", label: "Site phone", source: "customer.phone" },
        { key: "cartons", label: "Cartons", source: "order.cartons", required: true },
        { key: "temperature", label: "Temperature", default: "Frozen -18C", required: true },
        { key: "instructions", label: "Notes", source: "delivery.instructions" },
      ]),
      bodySubject: "Booking {{reference}} - {{deliverySuburb}} - {{cartons}} ctn FROZEN",
      bodyTemplate: `Account: {{account}}
Reference: {{reference}}

PICKUP
{{pickupAddress}}

DELIVER TO
{{deliveryName}}
{{deliveryAddress}}
{{deliverySuburb}} {{deliveryPostcode}}
Phone: {{contactPhone}}

FREIGHT
Cartons: {{cartons}}
Temperature: {{temperature}}
Notes: {{instructions}}`,
    },
  })

  await prisma.carrierZone.createMany({
    data: [
      // Specific postcodes beat the range below them.
      { carrierId: metro.id, name: "Sydney CBD", matchType: "postcode", matchValue: "2000", priority: 10, leadTimeDays: 0, baseRate: 45, perKgRate: 0.35, minCharge: 45 },
      { carrierId: metro.id, name: "Sydney Metro", matchType: "postcode_range", matchValue: "2000-2249", priority: 20, leadTimeDays: 1, baseRate: 55, perKgRate: 0.4, minCharge: 55 },
      { carrierId: metro.id, name: "Western Sydney", matchType: "postcode_range", matchValue: "2550-2770", priority: 20, leadTimeDays: 1, baseRate: 65, perKgRate: 0.45, minCharge: 65 },
    ],
  })

  // ---- Regional line-haul: books through a web portal, no email ----
  const regional = await prisma.carrier.create({
    data: {
      name: "Southern Cross Freight",
      tradingName: "SXF Regional",
      abn: "77 004 882 116",
      contactName: "Regional Bookings",
      email: "info@sxfreight.com.au",
      phone: "02 6885 2200",
      bookingMethod: "webform",
      portalUrl: "https://portal.sxfreight.com.au/consignments/new",
      cutoffTime: "11:00",
      accountNumber: "SXF-8823",
      companyId,
      formSchemaJson: JSON.stringify([
        { key: "consignor", label: "Consignor", source: "sender.name", required: true },
        { key: "consignorAddress", label: "Consignor address", source: "sender.address", required: true },
        { key: "consignee", label: "Consignee", source: "customer.name", required: true },
        { key: "consigneeAddress", label: "Consignee address", source: "delivery.address", required: true },
        { key: "town", label: "Town", source: "delivery.city", required: true },
        { key: "state", label: "State", source: "delivery.state", required: true },
        { key: "postcode", label: "Postcode", source: "delivery.postcode", required: true },
        { key: "reference", label: "Customer reference", source: "order.number", required: true },
        { key: "pieces", label: "Pieces", source: "order.cartons", required: true },
        { key: "weight", label: "Weight (kg)", source: "order.weightKg", required: true },
        { key: "goods", label: "Goods description", default: "Frozen bakery goods", required: true },
      ]),
    },
  })

  await prisma.carrierZone.createMany({
    data: [
      { carrierId: regional.id, name: "Regional NSW", matchType: "postcode_range", matchValue: "2250-2549", priority: 30, leadTimeDays: 2, baseRate: 120, perKgRate: 0.9, minCharge: 120 },
      { carrierId: regional.id, name: "Far West NSW", matchType: "postcode_range", matchValue: "2771-2899", priority: 30, leadTimeDays: 3, baseRate: 165, perKgRate: 1.1, minCharge: 165 },
    ],
  })

  // ---- Interstate: whole-state fallbacks, lowest priority so metro wins ----
  const interstate = await prisma.carrier.create({
    data: {
      name: "National Cold Chain",
      tradingName: "NCC Logistics",
      abn: "34 009 771 552",
      contactName: "Interstate Desk",
      email: "hello@ncclogistics.com.au",
      phone: "1300 552 118",
      bookingMethod: "email",
      bookingEmail: "consign@ncclogistics.com.au",
      cutoffTime: "10:00",
      accountNumber: "NCC-RDM-02",
      companyId,
      bodySubject: "New consignment {{reference}} to {{deliveryState}}",
    },
  })

  await prisma.carrierZone.createMany({
    data: [
      { carrierId: interstate.id, name: "Victoria", matchType: "state", matchValue: "VIC", priority: 90, leadTimeDays: 2, baseRate: 180, perKgRate: 1.2, minCharge: 180 },
      { carrierId: interstate.id, name: "Queensland", matchType: "state", matchValue: "QLD", priority: 90, leadTimeDays: 3, baseRate: 210, perKgRate: 1.4, minCharge: 210 },
      { carrierId: interstate.id, name: "South Australia", matchType: "state", matchValue: "SA", priority: 90, leadTimeDays: 3, baseRate: 220, perKgRate: 1.45, minCharge: 220 },
      { carrierId: interstate.id, name: "Western Australia", matchType: "state", matchValue: "WA", priority: 90, leadTimeDays: 5, baseRate: 340, perKgRate: 2.1, minCharge: 340 },
      // NSW fallback sits below the metro/regional rules on purpose.
      { carrierId: interstate.id, name: "NSW fallback", matchType: "state", matchValue: "NSW", priority: 95, leadTimeDays: 3, baseRate: 190, perKgRate: 1.25, minCharge: 190 },
    ],
  })

  console.log("✅ Created 3 carriers with 10 service areas")
}

if (require.main === module) {
  seedCarriers()
    .catch((error) => {
      console.error("❌ Carrier seed failed:", error)
      process.exit(1)
    })
    .finally(async () => {
      await prisma.$disconnect()
    })
}
