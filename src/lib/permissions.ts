import type { UserRole } from "@/lib/types"

/**
 * Named role sets for route-level authorisation.
 *
 * Every staff API route starts with `requireAdminUser(request, ROLE_SETS.x)`
 * so that "who may do this" is answered in one file instead of 50 inline
 * arrays that drift apart. A real permission model later means editing these
 * entries (or replacing them with capability checks), not hunting call sites.
 *
 * Role meanings (see User.role):
 *   admin      — full control, configuration, user management
 *   sales      — customers, quotes, orders, CRM
 *   warehouse  — stock, picking, deliveries, receiving
 *   accounts   — invoices, payments, credit, banking
 */
export type RoleSetName =
  | "adminOnly"
  | "commercial"
  | "finance"
  | "accounting"
  | "operations"
  | "staff"

export const ROLE_SETS: Record<RoleSetName, UserRole[]> = {
  /** Company registry and destructive/global configuration. */
  adminOnly: ["admin"],

  /** Commercial desk: pricing, quotes, customer records. */
  commercial: ["admin", "sales"],

  /** Money: invoices, payments, credit exposure, statements, applications. */
  finance: ["admin", "sales", "accounts"],

  /** Accounting records: chart of accounts, journals, bank feeds, reconciliation. */
  accounting: ["admin", "accounts"],

  /** Physical operations: picking, deliveries, stock movements, purchasing. */
  operations: ["admin", "sales", "warehouse"],

  /** Any signed-in staff member: dashboards, reference data, shared logs. */
  staff: ["admin", "sales", "warehouse", "accounts"],
}
