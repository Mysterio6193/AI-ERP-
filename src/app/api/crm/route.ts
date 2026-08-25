import { NextRequest, NextResponse } from "next/server"

import type { Prisma } from "@prisma/client"
import { requireAdminUser } from "@/lib/admin-auth"
import { findLapsedAccounts, getFocusList, summarisePipeline } from "@/lib/crm"
import { db } from "@/lib/db"

/**
 * Read model for the CRM screens.
 *
 * Deliberately backed by the same `lib/crm` functions the agent tools call, so
 * the dashboard and the agent can never disagree about who is lapsing or what
 * the pipeline is worth.
 */

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser(request, ["admin", "sales", "accounts"])
  if (auth.response) {
    return auth.response
  }

  const { searchParams } = new URL(request.url)
  const view = searchParams.get("view") || "focus"
  const mineOnly = searchParams.get("mineOnly") === "true"
  const userId = mineOnly ? auth.user?.id : undefined

  try {
    switch (view) {
      case "focus": {
        const [items, snapshot] = await Promise.all([
          getFocusList(userId),
          Promise.all([
            db.crmTask.count({ where: { status: "open" } }),
            db.case.count({ where: { status: { in: ["open", "in_progress"] } } }),
            db.lead.count({ where: { status: { in: ["new", "contacted", "qualified"] } } }),
          ]),
        ])

        const [openTasks, openCases, activeLeads] = snapshot

        return NextResponse.json({
          success: true,
          data: { items, counters: { openTasks, openCases, activeLeads } },
        })
      }

      case "pipeline": {
        return NextResponse.json({
          success: true,
          data: await summarisePipeline({ ownerId: userId }),
        })
      }

      case "lapsed": {
        return NextResponse.json({
          success: true,
          data: await findLapsedAccounts({ limit: 25, ...(userId ? { salesRepId: userId } : {}) }),
        })
      }

      case "leads": {
        // A prospect list runs to thousands of rows, so this view is searched
        // and paged rather than truncated - the newest 50 of 6,000 is not a
        // list anyone can work.
        const search = (searchParams.get("search") || "").trim()
        const status = searchParams.get("status") || ""
        const page = Math.max(Number(searchParams.get("page")) || 1, 1)
        const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 50, 1), 200)

        // Where the lead came from is the filter that matters after a trade
        // show: a rep needs the fifty people they met on Saturday, not every
        // lead the business has ever had.
        const source = searchParams.get("source") || ""

        const where: Prisma.LeadWhereInput = {
          ...(userId ? { ownerId: userId } : {}),
          ...(status && status !== "all" ? { status } : {}),
          ...(source && source !== "all" ? { source } : {}),
          ...(search
            ? {
                OR: [
                  { businessName: { contains: search, mode: "insensitive" } },
                  { contactName: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                  { phone: { contains: search, mode: "insensitive" } },
                  { suburb: { contains: search, mode: "insensitive" } },
                  { industry: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        }

        const [leads, total, statusCounts, sourceCounts] = await Promise.all([
          db.lead.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              id: true,
              businessName: true,
              contactName: true,
              email: true,
              phone: true,
              suburb: true,
              industry: true,
              source: true,
              status: true,
              estimatedValue: true,
              createdAt: true,
              owner: { select: { name: true } },
            },
          }),
          db.lead.count({ where }),
          db.lead.groupBy({ by: ["status"], _count: { status: true } }),
          db.lead.groupBy({ by: ["source"], _count: { source: true } }),
        ])

        return NextResponse.json({
          success: true,
          data: {
            leads,
            total,
            page,
            pageSize,
            pageCount: Math.ceil(total / pageSize),
            statusCounts: Object.fromEntries(
              statusCounts.map((row) => [row.status, row._count.status])
            ),
            sourceCounts: Object.fromEntries(
              sourceCounts.map((row) => [row.source, row._count.source])
            ),
          },
        })
      }

      /**
       * The account list, told as a channel rather than as a flat table.
       *
       * A distributor and the venues it supplies are different jobs — one is
       * reordering, the other is demand creation — so the list says which each
       * account is and, for a venue, who supplies it.
       */
      case "accounts": {
        const search = (searchParams.get("search") || "").trim()
        const role = searchParams.get("role") || ""
        const page = Math.max(Number(searchParams.get("page")) || 1, 1)
        const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 50, 1), 200)

        const where: Prisma.CustomerWhereInput = {
          ...(userId ? { salesRepId: userId } : {}),
          ...(role && role !== "all" ? { channelRole: role } : {}),
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: "insensitive" } },
                  { tradingName: { contains: search, mode: "insensitive" } },
                  { contactPerson: { contains: search, mode: "insensitive" } },
                  { email: { contains: search, mode: "insensitive" } },
                ],
              }
            : {}),
        }

        const [accounts, total, roleCounts, distributors] = await Promise.all([
          db.customer.findMany({
            where,
            orderBy: { name: "asc" },
            skip: (page - 1) * pageSize,
            take: pageSize,
            select: {
              id: true,
              name: true,
              contactPerson: true,
              email: true,
              phone: true,
              status: true,
              channelRole: true,
              creditStatus: true,
              creditBalance: true,
              suppliedBy: { select: { id: true, name: true } },
              salesRep: { select: { name: true } },
              _count: { select: { orders: true, supplies: true } },
            },
          }),
          db.customer.count({ where }),
          db.customer.groupBy({ by: ["channelRole"], _count: { channelRole: true } }),
          // For the "supplied by" picker; only a distributor may appear in it.
          db.customer.findMany({
            where: { channelRole: "distributor", status: "active" },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
        ])

        return NextResponse.json({
          success: true,
          data: {
            accounts,
            total,
            page,
            pageSize,
            pageCount: Math.ceil(total / pageSize),
            roleCounts: Object.fromEntries(
              roleCounts.map((row) => [row.channelRole ?? "direct", row._count.channelRole])
            ),
            distributors,
          },
        })
      }

      case "cases": {
        const cases = await db.case.findMany({
          where: {
            status: { in: ["open", "in_progress"] },
            ...(userId ? { assignedToId: userId } : {}),
          },
          orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
          take: 50,
          select: {
            id: true,
            caseNumber: true,
            subject: true,
            description: true,
            category: true,
            severity: true,
            status: true,
            createdAt: true,
            createdByAgent: true,
            customer: { select: { id: true, name: true } },
            contact: { select: { name: true } },
            assignedTo: { select: { name: true } },
          },
        })

        return NextResponse.json({ success: true, data: cases })
      }

      case "activities": {
        const activities = await db.activity.findMany({
          where: userId ? { userId } : {},
          orderBy: { occurredAt: "desc" },
          take: 50,
          select: {
            id: true,
            type: true,
            subject: true,
            body: true,
            outcome: true,
            occurredAt: true,
            createdByAgent: true,
            channel: true,
            customer: { select: { id: true, name: true } },
            contact: { select: { name: true } },
            user: { select: { name: true } },
          },
        })

        return NextResponse.json({ success: true, data: activities })
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown view "${view}"` }, { status: 400 })
    }
  } catch (error) {
    console.error("CRM read failed:", error)
    return NextResponse.json({ success: false, error: "Failed to load CRM data" }, { status: 500 })
  }
}
