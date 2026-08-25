import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * The people the business already knows about, put where the CRM looks.
 *
 * Seventeen of eighteen customers carry a named contact person with an email
 * and a phone number, on the Customer row. The Contact table has nothing in it.
 * So every account's Contacts tab is empty, `listContacts` returns nothing to
 * the agent, and "who do I ring at Bella Napoli" has an answer the CRM cannot
 * reach — while the answer sits one column away.
 *
 * This is the shape a CRM rots into: the data is in the system, just not in the
 * part of the system that was built to use it. Backfilling once would fix it
 * today and leave it to rot again, so `ensurePrimaryContact` runs whenever a
 * customer is written and keeps the two in step.
 *
 * Deliberately one contact per customer, marked primary. The Customer row can
 * only ever describe one person, and inventing more from it would be inventing.
 */

/**
 * What this person is for, guessed from the address they use.
 *
 * A generic mailbox is a role rather than a person, and which role it is
 * changes who gets rung about an overdue invoice versus a delivery. Guessing
 * wrong is cheap here — the row is editable and the name is still right — while
 * not guessing at all means every contact is an undifferentiated "buyer".
 */
export function inferRole(email?: string | null, name?: string | null): string {
  const address = (email ?? "").toLowerCase()
  const person = (name ?? "").toLowerCase()

  if (/^(accounts|ap|payable|billing|finance|remittance)/.test(address)) return "accounts_payable"
  if (/^(purchasing|procurement|buying|orders?|supply)/.test(address)) return "buyer"
  if (/^(chef|kitchen|head ?chef)/.test(address) || /\bchef\b/.test(person)) return "chef"
  if (/^(manager|ops|operations|venue)/.test(address) || /\bmanager\b/.test(person)) return "manager"
  if (/^(owner|director|principal)/.test(address) || /\bowner\b/.test(person)) return "owner"

  return "buyer"
}

/**
 * Whether an address belongs to a person or to a department.
 *
 * It changes how the contact should be addressed: writing "Hi orders@" is worse
 * than writing nothing, and a rep needs to know before they open with a name.
 */
export function isGenericMailbox(email?: string | null): boolean {
  const local = (email ?? "").toLowerCase().split("@")[0]

  return /^(info|admin|orders?|sales|accounts|ap|purchasing|procurement|enquiries|contact|hello|office|reception|billing|finance|supply|buying)$/.test(
    local
  )
}

export interface DerivedContact {
  name: string
  email: string | null
  phone: string | null
  role: string
  isPrimary: true
  notes: string | null
}

/**
 * The contact implied by a customer record, or nothing.
 *
 * Returns null rather than a placeholder when there is no name: a Contact
 * called "Unknown" is worse than an empty tab, because it looks like an answer.
 */
export function deriveContact(customer: {
  contactPerson?: string | null
  email?: string | null
  phone?: string | null
}): DerivedContact | null {
  const name = customer.contactPerson?.trim()

  if (!name) return null

  const email = customer.email?.trim() || null

  return {
    name,
    email,
    phone: customer.phone?.trim() || null,
    role: inferRole(email, name),
    isPrimary: true,
    notes: isGenericMailbox(email)
      ? `${email} is a shared mailbox, not ${name.split(" ")[0]}'s own address.`
      : null,
  }
}

export type SyncResult =
  | { ok: false; reason: string }
  | { ok: true; action: "created" | "updated" | "unchanged"; contactId: string }

/**
 * Make sure this customer's contact person exists as a Contact.
 *
 * Idempotent, and matched on name rather than on a stored link because there is
 * no foreign key between the two — running it repeatedly corrects rather than
 * duplicates.
 *
 * Never throws. A contact row is worth having and never worth failing a
 * customer save for.
 */
export async function ensurePrimaryContact(db: DbClient, customerId: string): Promise<SyncResult> {
  try {
    const customer = await db.customer.findUnique({
      where: { id: customerId },
      select: { contactPerson: true, email: true, phone: true },
    })

    if (!customer) return { ok: false, reason: "No such customer" }

    const derived = deriveContact(customer)
    if (!derived) return { ok: false, reason: "That customer names no contact person" }

    const existing = await db.contact.findFirst({
      where: { customerId, name: derived.name },
      select: { id: true, email: true, phone: true, role: true },
    })

    if (existing) {
      /**
       * Only fill gaps. A contact edited in the CRM is someone's deliberate
       * correction, and overwriting it from the Customer row every save would
       * make those edits impossible to keep.
       */
      const patch: Record<string, unknown> = {}
      if (!existing.email && derived.email) patch.email = derived.email
      if (!existing.phone && derived.phone) patch.phone = derived.phone

      if (Object.keys(patch).length === 0) {
        return { ok: true, action: "unchanged", contactId: existing.id }
      }

      await db.contact.update({ where: { id: existing.id }, data: patch })
      return { ok: true, action: "updated", contactId: existing.id }
    }

    // A second primary would make "the primary contact" ambiguous.
    const hasPrimary = await db.contact.count({ where: { customerId, isPrimary: true } })

    const created = await db.contact.create({
      data: {
        customerId,
        name: derived.name,
        email: derived.email,
        phone: derived.phone,
        role: derived.role,
        isPrimary: hasPrimary === 0,
        notes: derived.notes,
        status: "active",
      },
      select: { id: true },
    })

    return { ok: true, action: "created", contactId: created.id }
  } catch (error) {
    console.error(`Could not sync contact for customer ${customerId}:`, error)
    return { ok: false, reason: "Write failed" }
  }
}
