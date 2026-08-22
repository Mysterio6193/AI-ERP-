import { db } from "@/lib/db"
import { nextDocumentNumber } from "@/lib/numbering"

/**
 * Third-party freight booking.
 *
 * Delivery is subcontracted and the carrier depends on the destination, so the
 * work is: match the address to a service area, fill that carrier's own booking
 * form from the order, and send it. Carriers differ in what they ask for, so a
 * carrier's form is stored as a field list and filled by reading dotted paths
 * out of an order context - adding a carrier is data entry, not code.
 *
 * Nothing here sends anything. `renderBooking` produces the exact text and
 * `markBookingSent` records a dispatch that the caller performed, so the
 * approval gate stays in one place: the agent tool and the API action.
 */

export interface CarrierFormField {
  key: string
  label: string
  required?: boolean
  /** Dotted path into the order context, e.g. "customer.name". */
  source?: string
  default?: string
}

export interface ResolvedCarrier {
  carrierId: string
  carrier: string
  zoneId: string
  zone: string
  matchedOn: string
  leadTimeDays: number
  estimatedPrice: number | null
  bookingMethod: string
  bookingEmail: string | null
}

const DEFAULT_FORM: CarrierFormField[] = [
  { key: "reference", label: "Your reference", source: "order.number", required: true },
  { key: "pickupName", label: "Pickup from", source: "sender.name", required: true },
  { key: "pickupAddress", label: "Pickup address", source: "sender.address", required: true },
  { key: "deliveryName", label: "Deliver to", source: "customer.name", required: true },
  { key: "deliveryAddress", label: "Delivery address", source: "delivery.address", required: true },
  { key: "deliverySuburb", label: "Suburb", source: "delivery.city" },
  { key: "deliveryState", label: "State", source: "delivery.state" },
  { key: "deliveryPostcode", label: "Postcode", source: "delivery.postcode", required: true },
  { key: "contactPhone", label: "Contact phone", source: "customer.phone" },
  { key: "items", label: "Items", source: "order.itemSummary", required: true },
  { key: "cartons", label: "Carton count", source: "order.cartons" },
  { key: "instructions", label: "Delivery instructions", source: "delivery.instructions" },
]

/**
 * Every value a booking form field can be filled from.
 *
 * Exported so the form editor offers exactly what `buildOrderContext` produces.
 * A hand-typed source path that does not exist here silently fills blank, which
 * is how a booking goes out missing an address.
 */
export const FORM_SOURCES: Array<{ path: string; label: string; group: string }> = [
  { path: "order.number", label: "Order number", group: "Order" },
  { path: "order.date", label: "Order date", group: "Order" },
  { path: "order.total", label: "Order total", group: "Order" },
  { path: "order.itemSummary", label: "Items", group: "Order" },
  { path: "order.cartons", label: "Carton count", group: "Order" },
  { path: "order.weightKg", label: "Weight (kg)", group: "Order" },
  { path: "order.instructions", label: "Order instructions", group: "Order" },

  { path: "customer.name", label: "Customer name", group: "Customer" },
  { path: "customer.contact", label: "Contact person", group: "Customer" },
  { path: "customer.phone", label: "Customer phone", group: "Customer" },
  { path: "customer.email", label: "Customer email", group: "Customer" },

  { path: "delivery.address", label: "Delivery address", group: "Delivery" },
  { path: "delivery.city", label: "Suburb", group: "Delivery" },
  { path: "delivery.state", label: "State", group: "Delivery" },
  { path: "delivery.postcode", label: "Postcode", group: "Delivery" },
  { path: "delivery.instructions", label: "Delivery notes", group: "Delivery" },

  { path: "sender.name", label: "Pickup business", group: "Pickup" },
  { path: "sender.address", label: "Pickup address", group: "Pickup" },
  { path: "sender.phone", label: "Pickup phone", group: "Pickup" },
]

export function parseFormSchema(json: string | null): CarrierFormField[] {
  if (!json) {
    return DEFAULT_FORM
  }

  try {
    const parsed = JSON.parse(json)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_FORM
    }

    return parsed.filter(
      (field): field is CarrierFormField =>
        Boolean(field) && typeof field === "object" && typeof field.key === "string"
    )
  } catch {
    return DEFAULT_FORM
  }
}

function inRange(postcode: string, rangeValue: string) {
  const [rawFrom, rawTo] = rangeValue.split("-").map((part) => part.trim())
  const code = Number(postcode)
  const from = Number(rawFrom)
  const to = Number(rawTo)

  if (!Number.isFinite(code) || !Number.isFinite(from) || !Number.isFinite(to)) {
    return false
  }

  return code >= from && code <= to
}

function zoneMatches(
  zone: { matchType: string; matchValue: string },
  address: { state?: string | null; postcode?: string | null; city?: string | null }
) {
  const value = zone.matchValue.trim()
  const postcode = (address.postcode || "").trim()

  switch (zone.matchType) {
    case "postcode":
      return Boolean(postcode) && postcode === value
    case "postcode_range":
      return Boolean(postcode) && inRange(postcode, value)
    case "state":
      return (address.state || "").trim().toUpperCase() === value.toUpperCase()
    case "suburb":
      return (address.city || "").trim().toLowerCase() === value.toLowerCase()
    default:
      return false
  }
}

/**
 * Picks the carrier for a destination.
 *
 * Lowest priority number wins, so a single-postcode rule beats a whole-state
 * fallback. Returns null rather than guessing when nothing covers the address -
 * a wrong carrier is worse than an unrouted booking someone has to look at.
 */
export async function resolveCarrierForAddress(input: {
  state?: string | null
  postcode?: string | null
  city?: string | null
  companyId?: string | null
  weightKg?: number
}): Promise<ResolvedCarrier | null> {
  const zones = await db.carrierZone.findMany({
    where: {
      enabled: true,
      carrier: {
        enabled: true,
        // A carrier with no company is shared across the group. This business
        // bills from several entities but uses the same freight panel, so
        // scoping strictly by company would leave most orders unrouted.
        ...(input.companyId
          ? { OR: [{ companyId: input.companyId }, { companyId: null }] }
          : {}),
      },
    },
    include: { carrier: true },
    orderBy: { priority: "asc" },
  })

  const match = zones.find((zone) => zoneMatches(zone, input))
  if (!match) {
    return null
  }

  const weight = input.weightKg ?? 0
  const computed = match.baseRate + match.perKgRate * weight
  const estimated = computed > 0 ? Math.max(computed, match.minCharge) : null

  return {
    carrierId: match.carrierId,
    carrier: match.carrier.name,
    zoneId: match.id,
    zone: match.name,
    matchedOn: `${match.matchType} ${match.matchValue}`,
    leadTimeDays: match.leadTimeDays,
    estimatedPrice: estimated === null ? null : Number(estimated.toFixed(2)),
    bookingMethod: match.carrier.bookingMethod,
    bookingEmail: match.carrier.bookingEmail,
  }
}

/** Reads a dotted path out of the order context. */
function readPath(context: Record<string, unknown>, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), context)

  if (value === null || value === undefined) {
    return ""
  }

  return String(value)
}

/**
 * Assembles the context a carrier form is filled from: the order, the shipping
 * location, and the sending company as pickup.
 */
export async function buildOrderContext(orderId: string) {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: { include: { locations: true } },
      items: { include: { product: true } },
      company: true,
    },
  })

  if (!order) {
    return null
  }

  const locations = order.customer.locations
  const shipping =
    locations.find((location) => location.id === order.locationId) ||
    locations.find((location) => location.isShipping && location.isDefault) ||
    locations.find((location) => location.isShipping) ||
    locations.find((location) => location.isDefault) ||
    locations[0] ||
    null

  const cartons = order.items.reduce((sum, item) => sum + item.quantity, 0)
  const weightKg = order.items.reduce(
    (sum, item) => sum + (item.product.weight || 0) * item.quantity,
    0
  )

  const itemSummary = order.items
    .map((item) => `${item.quantity} x ${item.product.name}`)
    .join("; ")

  return {
    order: {
      id: order.id,
      number: order.orderNumber,
      date: order.orderDate.toISOString().slice(0, 10),
      total: order.totalAmount.toFixed(2),
      itemSummary,
      cartons,
      weightKg: Number(weightKg.toFixed(2)),
      instructions: order.deliveryInstructions || "",
    },
    customer: {
      id: order.customer.id,
      name: order.customer.name,
      contact: order.customer.contactPerson || "",
      phone: order.customer.phone || "",
      email: order.customer.email || "",
    },
    delivery: {
      address: [shipping?.address, shipping?.address2].filter(Boolean).join(", "),
      city: shipping?.city || "",
      state: shipping?.state || "",
      postcode: shipping?.postcode || "",
      instructions: shipping?.deliveryNotes || order.deliveryInstructions || "",
    },
    sender: {
      name: order.company?.tradingName || order.company?.name || "",
      address: [order.company?.address, order.company?.city, order.company?.state, order.company?.postcode]
        .filter(Boolean)
        .join(", "),
      phone: order.company?.phone || "",
    },
    _raw: { companyId: order.companyId, weightKg },
  }
}

export interface DraftedBooking {
  ok: boolean
  error?: string
  carrier?: ResolvedCarrier
  payload?: Record<string, string>
  missing?: string[]
  context?: Awaited<ReturnType<typeof buildOrderContext>>
}

/**
 * Fills a carrier's booking form from an order.
 *
 * Required fields that resolve to nothing are reported rather than sent blank,
 * because a booking missing an address gets silently dropped by the carrier and
 * nobody finds out until the delivery does not arrive.
 */
export async function draftBooking(input: {
  orderId: string
  carrierId?: string
}): Promise<DraftedBooking> {
  const context = await buildOrderContext(input.orderId)
  if (!context) {
    return { ok: false, error: "Order not found" }
  }

  const carrier = input.carrierId
    ? await (async () => {
        const row = await db.carrier.findUnique({
          where: { id: input.carrierId },
          include: { zones: { where: { enabled: true }, orderBy: { priority: "asc" } } },
        })

        if (!row) {
          return null
        }

        const zone = row.zones.find((candidate) => zoneMatches(candidate, context.delivery))

        return {
          carrierId: row.id,
          carrier: row.name,
          zoneId: zone?.id || "",
          zone: zone?.name || "Manual selection",
          matchedOn: zone ? `${zone.matchType} ${zone.matchValue}` : "chosen directly",
          leadTimeDays: zone?.leadTimeDays ?? 1,
          estimatedPrice: null,
          bookingMethod: row.bookingMethod,
          bookingEmail: row.bookingEmail,
        } satisfies ResolvedCarrier
      })()
    : await resolveCarrierForAddress({
        ...context.delivery,
        companyId: context._raw.companyId,
        weightKg: context._raw.weightKg,
      })

  if (!carrier) {
    return {
      ok: false,
      error: `No carrier covers ${context.delivery.city || "that address"} ${context.delivery.postcode}. Add a service area for it.`,
      context,
    }
  }

  const carrierRow = await db.carrier.findUnique({ where: { id: carrier.carrierId } })
  const schema = parseFormSchema(carrierRow?.formSchemaJson ?? null)

  const payload: Record<string, string> = {}
  const missing: string[] = []

  for (const field of schema) {
    const value = field.source ? readPath(context as unknown as Record<string, unknown>, field.source) : ""
    const resolved = value || field.default || ""

    payload[field.key] = resolved

    if (field.required && !resolved) {
      missing.push(field.label)
    }
  }

  return { ok: true, carrier, payload, missing, context }
}

/** Fills {{key}} placeholders, leaving unknown ones visible rather than blank. */
export function renderTemplate(template: string, payload: Record<string, string>) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) =>
    key in payload ? payload[key] : match
  )
}

function defaultBody(payload: Record<string, string>, schema: CarrierFormField[]) {
  return schema
    .map((field) => `${field.label}: ${payload[field.key] || "-"}`)
    .join("\n")
}

/** Produces the exact subject and body that would be sent to the carrier. */
export async function renderBooking(input: {
  carrierId: string
  payload: Record<string, string>
}) {
  const carrier = await db.carrier.findUnique({ where: { id: input.carrierId } })

  if (!carrier) {
    return { ok: false as const, error: "Carrier not found" }
  }

  const schema = parseFormSchema(carrier.formSchemaJson)

  const subject = carrier.bodySubject
    ? renderTemplate(carrier.bodySubject, input.payload)
    : `Booking request - ${input.payload.reference || "new consignment"}`

  const body = carrier.bodyTemplate
    ? renderTemplate(carrier.bodyTemplate, input.payload)
    : defaultBody(input.payload, schema)

  return {
    ok: true as const,
    carrier: { id: carrier.id, name: carrier.name, method: carrier.bookingMethod, email: carrier.bookingEmail },
    subject,
    body,
  }
}

async function nextBookingNumber() {
  const count = await db.freightBooking.count()
  const year = new Date().getFullYear()
  return `FB-${year}-${String(count + 1).padStart(4, "0")}`
}

/** Persists a drafted booking. Contacts nobody. */
export async function createBooking(input: {
  orderId?: string
  carrierId: string
  zoneId?: string
  payload: Record<string, string>
  quotedPrice?: number | null
  pickupDate?: Date | null
  createdByAgent?: boolean
  companyId?: string | null
}) {
  const rendered = await renderBooking({ carrierId: input.carrierId, payload: input.payload })

  if (!rendered.ok) {
    return { ok: false as const, error: rendered.error }
  }

  const booking = await db.freightBooking.create({
    data: {
      bookingNumber: await nextDocumentNumber("freightBooking", {
        db,
        legacy: nextBookingNumber,
      }),
      orderId: input.orderId || null,
      carrierId: input.carrierId,
      zoneId: input.zoneId || null,
      status: "draft",
      payloadJson: JSON.stringify(input.payload),
      renderedSubject: rendered.subject,
      renderedBody: rendered.body,
      quotedPrice: input.quotedPrice ?? null,
      pickupDate: input.pickupDate ?? null,
      createdByAgent: input.createdByAgent ?? false,
      companyId: input.companyId || null,
    },
  })

  return { ok: true as const, booking, rendered }
}

/** Records that a booking was dispatched. The caller performs the send. */
export async function markBookingSent(input: {
  bookingId: string
  sentTo: string
  externalRef?: string
}) {
  const booking = await db.freightBooking.update({
    where: { id: input.bookingId },
    data: {
      status: "sent",
      sentTo: input.sentTo,
      sentAt: new Date(),
      externalRef: input.externalRef || null,
    },
  })

  return { ok: true as const, booking }
}
