import type { Prisma, PrismaClient } from "@prisma/client"

type DbClient = PrismaClient | Prisma.TransactionClient

/**
 * Who approved what, and why.
 *
 * `ApprovalAction` was modelled and never written. The platform has
 * `requiresApproval`, a `pending_approval` status and an `approved` status —
 * and no record anywhere of who made the call or what they said. An order that
 * went out at an unusual discount could be traced to the moment it changed
 * status and no further.
 *
 * Recorded rather than enforced: this does not gate anything, it remembers.
 * A decision nobody can attribute is the one that gets argued about later.
 */

export type ApprovalDecision = "approved" | "rejected" | "requested_changes"

export interface RecordApprovalInput {
  entityType: "quote" | "sales_order" | "discount"
  entityId: string
  action: ApprovalDecision
  userId: string
  comments?: string | null
  /** Set so the row joins back to the document it belongs to. */
  quoteId?: string | null
  salesOrderId?: string | null
}

export async function recordApproval(db: DbClient, input: RecordApprovalInput) {
  if (!input.userId) {
    // An unattributed approval is worse than none: it looks like a decision was
    // made and reviewed when nobody can say by whom.
    return { ok: false as const, reason: "No user to attribute the decision to" }
  }

  const action = await db.approvalAction.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      userId: input.userId,
      comments: input.comments || null,
      quoteId: input.quoteId || (input.entityType === "quote" ? input.entityId : null),
      salesOrderId:
        input.salesOrderId || (input.entityType === "sales_order" ? input.entityId : null),
    },
    select: { id: true, action: true, createdAt: true },
  })

  return { ok: true as const, approval: action }
}

/**
 * The decision trail for one document, newest first.
 *
 * Includes who, so "who signed this off" is answerable from the document
 * rather than from a status log that only records that it changed.
 */
export async function approvalHistory(
  db: DbClient,
  entityType: string,
  entityId: string
) {
  return db.approvalAction.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, role: true } } },
  })
}
