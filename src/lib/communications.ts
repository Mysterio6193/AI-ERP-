import nodemailer from "nodemailer"

import { db } from "@/lib/db"
import { sendTelegramMessage } from "@/lib/agent/channels/telegram"
import {
  buildDocumentEmailMessage,
  buildDocumentEmailSubject,
  getCompanyDisplayName,
  getCompanyEmail,
  sanitizeCompanyBranding,
} from "@/lib/company-branding"

let transporterPromise: Promise<nodemailer.Transporter | null> | null = null

function parseSmtpSecure() {
  const raw = String(process.env.SMTP_SECURE || "").trim().toLowerCase()
  return raw === "1" || raw === "true" || raw === "yes"
}

async function getTransporter() {
  if (transporterPromise) {
    return transporterPromise
  }

  transporterPromise = (async () => {
    const host = process.env.SMTP_HOST
    const port = Number(process.env.SMTP_PORT || 587)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS

    if (!host || !port || !user || !pass) {
      return null
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: parseSmtpSecure(),
      auth: {
        user,
        pass,
      },
    })
  })()

  return transporterPromise
}

function formatEmailFrom(name: string, email: string) {
  return `"${name.replace(/"/g, "")}" <${email}>`
}

export async function sendCommunicationMessage(input: {
  to: string
  method?: string
  subject?: string | null
  message?: string | null
  documentType?: "invoice" | "order" | "statement" | "purchase_order"
  documentId?: string | null
  documentNumber?: string | null
  customerId?: string | null
  supplierId?: string | null
  metadata?: Record<string, unknown>
  /**
   * The entity this message is sent as. The group bills from several companies,
   * so falling back to the first row would put the wrong ABN and bank details
   * on a customer's invoice email.
   */
  companyId?: string | null
}) {
  const company = sanitizeCompanyBranding(
    input.companyId
      ? await db.company.findUnique({ where: { id: input.companyId } })
      : await db.company.findFirst()
  )
  const deliveryMethod = input.method || "email"
  const documentNumber = input.documentNumber || input.documentId || "Document"
  const subject =
    input.subject ||
    (input.documentType
      ? buildDocumentEmailSubject(company, input.documentType, documentNumber)
      : `${getCompanyDisplayName(company)} notification`)
  const message =
    input.message ||
    (input.documentType
      ? buildDocumentEmailMessage(company, input.documentType, documentNumber)
      : `Please review ${documentNumber} from ${getCompanyDisplayName(company)}.`)

  const fromName = process.env.SMTP_FROM_NAME || getCompanyDisplayName(company)
  const fromEmail =
    process.env.SMTP_FROM_EMAIL ||
    getCompanyEmail(company) ||
    process.env.SMTP_USER ||
    "noreply@localhost"

  let status = "queued"
  let externalId: string | null = null
  let failureReason: string | null = null

  if (deliveryMethod === "email") {
    const transporter = await getTransporter()

    if (transporter) {
      try {
        const info = await transporter.sendMail({
          from: formatEmailFrom(fromName, fromEmail),
          replyTo: getCompanyEmail(company) || fromEmail,
          to: input.to,
          subject,
          text: message,
        })
        status = "sent"
        externalId = info.messageId || null
      } catch (error) {
        console.error("Email delivery failed:", error)
        status = "failed"
        failureReason = error instanceof Error ? error.message : "Unknown email delivery error"
      }
    } else {
      // "queued" was a lie: there is no queue and no retry, so the message was
      // recorded as pending delivery and would never be sent. Non-email
      // channels already fail loudly for the same reason — an invoice that
      // looks sent and reaches nobody is worse than one that visibly failed.
      status = "failed"
      failureReason =
        "No mail transport configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS to send email."
      console.warn(
        `[COMMUNICATION] ${failureReason} ${input.documentType || "Message"} for ${input.to} was recorded but not sent.`
      )
    }
  } else if (deliveryMethod === "telegram") {
    // Telegram could always send — `sendTelegramMessage` has existed the whole
    // time — but nothing routed to it, so a Telegram message was logged as
    // queued and silently never left.
    try {
      await sendTelegramMessage(input.to, subject ? `${subject}\n\n${message}` : message)
      status = "sent"
    } catch (error) {
      console.error("Telegram delivery failed:", error)
      status = "failed"
      failureReason = error instanceof Error ? error.message : "Unknown Telegram delivery error"
    }
  } else {
    // Everything else has no transport yet. Recording it as "queued" was the
    // dangerous part: queued reads as "will be sent shortly", and it never
    // would be. A marketing send to a WhatsApp audience looked delivered and
    // reached nobody.
    status = "failed"
    failureReason = `No transport for "${deliveryMethod}". The message was recorded but not sent.`
    console.warn(`[COMMUNICATION] ${failureReason} Recipient: ${input.to}`)
  }

  const log = await (db as any).communicationLog.create({
    data: {
      customerId: input.customerId || null,
      supplierId: input.supplierId || null,
      method: deliveryMethod,
      direction: "outbound",
      documentType: input.documentType || null,
      documentId: input.documentId || null,
      documentNumber: input.documentNumber || null,
      recipient: input.to,
      subject,
      message,
      status,
      externalId,
      metadataJson: JSON.stringify({
        fromName,
        fromEmail,
        failureReason,
        ...(input.metadata || {}),
      }),
    },
  })

  return {
    success: status !== "failed",
    status,
    subject,
    message,
    fromName,
    fromEmail,
    id: log.id,
  }
}

function formatOrderEmailBody(order: {
  orderNumber: string
  totalAmount: number
  orderDate: Date
  requiredDate?: Date | null
  customerNotes?: string | null
  customer: { name: string }
  items: Array<{
    quantity: number
    total: number
    product: { name: string; sku: string }
  }>
}, event: "created" | "confirmed" | "cancelled") {
  const intro =
    event === "cancelled"
      ? `Your sales order ${order.orderNumber} has been cancelled.`
      : event === "confirmed"
        ? `Your sales order ${order.orderNumber} has been confirmed and is now being processed.`
        : `Your sales order ${order.orderNumber} has been received.`

  const itemLines = order.items
    .map((item) => `- ${item.product.name} (${item.product.sku}) x ${item.quantity}`)
    .join("\n")

  return [
    `Hi ${order.customer.name},`,
    "",
    intro,
    "",
    `Order date: ${order.orderDate.toLocaleDateString()}`,
    order.requiredDate ? `Requested delivery: ${order.requiredDate.toLocaleDateString()}` : null,
    `Order total: ${order.totalAmount.toFixed(2)}`,
    "",
    "Items:",
    itemLines,
    order.customerNotes ? "" : null,
    order.customerNotes ? `Notes: ${order.customerNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n")
}

export async function sendSalesOrderEmail(orderId: string, event: "created" | "confirmed" | "cancelled") {
  const order = await db.salesOrder.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              name: true,
              sku: true,
            },
          },
        },
      },
    },
  })

  if (!order?.customer?.email) {
    return null
  }

  const subjectPrefix =
    event === "cancelled"
      ? "Sales Order Cancelled"
      : event === "confirmed"
        ? "Sales Order Confirmed"
        : "Sales Order Received"

  return sendCommunicationMessage({
    to: order.customer.email,
    customerId: order.customer.id,
    // Brand as the entity that owns the order, not whichever company sorts first.
    companyId: order.companyId,
    method: "email",
    documentType: "order",
    documentId: order.id,
    documentNumber: order.orderNumber,
    subject: `${subjectPrefix}: ${order.orderNumber}`,
    message: formatOrderEmailBody(order, event),
    metadata: {
      source: "order_workflow",
      event,
    },
  })
}
