import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Reusable messages, with the customer's details filled in.
 *
 * `MessageTemplate` was modelled and nothing ever created one or read one, so
 * every chase, confirmation and follow-up was written from scratch — which
 * means the wording drifts, the tone drifts, and an agent asked to chase an
 * invoice invents its own phrasing each time.
 *
 * The dangerous part is not the storing, it is the filling in: a template that
 * quietly ships with `{{amount}}` still in it tells a customer they owe
 * `{{amount}}`. Rendering therefore reports what it could not fill rather than
 * leaving a hole in a message someone is about to send.
 */

/** `{{name}}`, tolerant of spaces inside the braces. */
const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g

export interface RenderResult {
  text: string
  /** Placeholders the values did not cover. */
  missing: string[]
  ok: boolean
}

/**
 * Fill a template's placeholders.
 *
 * An unresolved placeholder is left visible rather than blanked. "You owe
 * {{amount}}" is obviously broken and gets caught; "You owe " reads like a
 * finished sentence and does not.
 */
export function renderTemplate(
  body: string,
  values: Record<string, unknown>
): RenderResult {
  const missing: string[] = []

  const text = body.replace(TOKEN, (whole, key: string) => {
    const value = values[key]

    if (value === undefined || value === null || value === "") {
      if (!missing.includes(key)) missing.push(key)
      return whole
    }

    return String(value)
  })

  return { text, missing, ok: missing.length === 0 }
}

/** Every placeholder a template expects, so a caller can see what to supply. */
export function templateVariables(body: string): string[] {
  const found = new Set<string>()

  for (const match of body.matchAll(TOKEN)) {
    found.add(match[1])
  }

  return [...found]
}

export interface ResolvedTemplate {
  id: string
  name: string
  channel: string
  subject: string | null
  body: string
  missing: string[]
  ok: boolean
}

/**
 * Look a template up by name and fill it in.
 *
 * Returns `ok: false` with the gaps rather than a half-filled message, so a
 * caller decides whether to send. Nothing here sends anything.
 */
export async function renderNamedTemplate(
  db: DbClient,
  name: string,
  values: Record<string, unknown>
): Promise<{ ok: false; error: string } | { ok: true; template: ResolvedTemplate }> {
  const template = await db.messageTemplate.findFirst({
    where: { name },
    select: { id: true, name: true, channel: true, subject: true, body: true, approvalStatus: true },
  })

  if (!template) {
    return { ok: false, error: `No message template named "${name}".` }
  }

  if (template.approvalStatus === "rejected") {
    // A rejected template was turned down for a reason; sending it anyway
    // defeats whatever review rejected it.
    return { ok: false, error: `Template "${name}" was rejected and cannot be used.` }
  }

  const rendered = renderTemplate(template.body, values)
  const subject = template.subject ? renderTemplate(template.subject, values) : null

  const missing = [...new Set([...rendered.missing, ...(subject?.missing ?? [])])]

  return {
    ok: true,
    template: {
      id: template.id,
      name: template.name,
      channel: template.channel,
      subject: subject?.text ?? null,
      body: rendered.text,
      missing,
      ok: missing.length === 0,
    },
  }
}

/**
 * The starting set.
 *
 * Deliberately plain. These are read by customers, and a chase that sounds
 * automated gets treated as automated — the point is that a person could have
 * written it.
 */
export const DEFAULT_TEMPLATES = [
  {
    name: "invoice_overdue_first",
    channel: "email",
    subject: "Invoice {{invoiceNumber}} — now overdue",
    body: `Hi {{contactName}},

Invoice {{invoiceNumber}} for {{amount}} was due on {{dueDate}} and is now {{daysOverdue}} days overdue.

If it has already been paid, please ignore this and let me know so I can chase it up at our end.

Thanks,
{{companyName}}`,
  },
  {
    name: "invoice_overdue_final",
    channel: "email",
    subject: "Invoice {{invoiceNumber}} — {{daysOverdue}} days overdue",
    body: `Hi {{contactName}},

Invoice {{invoiceNumber}} for {{amount}} is now {{daysOverdue}} days overdue.

We need to settle this before your next order goes out. If there is a problem with the invoice, tell me what it is and I will sort it.

Thanks,
{{companyName}}`,
  },
  {
    name: "order_confirmed",
    channel: "email",
    subject: "Order {{orderNumber}} confirmed",
    body: `Hi {{contactName}},

Your order {{orderNumber}} is confirmed for delivery on {{deliveryDate}}.

Total: {{amount}}

Anything to change, reply to this and I will pick it up.

{{companyName}}`,
  },
  {
    name: "quote_follow_up",
    channel: "email",
    subject: "Quote {{quoteNumber}}",
    body: `Hi {{contactName}},

Following up on quote {{quoteNumber}} for {{amount}}, which is valid until {{validUntil}}.

Happy to adjust quantities or work through the pricing if that helps.

{{companyName}}`,
  },
  {
    name: "delivery_delayed",
    channel: "email",
    subject: "Delivery for order {{orderNumber}}",
    body: `Hi {{contactName}},

Your order {{orderNumber}} will not make its {{deliveryDate}} slot. The new expected date is {{newDate}}.

Apologies for the short notice — tell me if that does not work and I will find another way to get it to you.

{{companyName}}`,
  },
]

/**
 * Create the starting templates that are missing.
 *
 * Gap-filling rather than seed-once, so adding a template to the list later
 * reaches an install that already exists — and never overwrites wording
 * someone has edited.
 */
export async function ensureDefaultTemplates(db: DbClient) {
  const existing = await db.messageTemplate.findMany({ select: { name: true } })
  const present = new Set(existing.map((t) => t.name))
  const missing = DEFAULT_TEMPLATES.filter((t) => !present.has(t.name))

  if (missing.length > 0) {
    await db.messageTemplate.createMany({
      data: missing.map((t) => ({
        name: t.name,
        channel: t.channel,
        subject: t.subject,
        body: t.body,
        approvalStatus: "approved",
      })),
      skipDuplicates: true,
    })
  }

  return { created: missing.length, existing: present.size }
}
