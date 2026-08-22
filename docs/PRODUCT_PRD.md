# SupplySure OS Product Requirements Document

Last updated: April 2, 2026  
Scope: Main SaaS app + separate driver app in this repository  
Explicitly excluded: `/VERO` archived bundle

## 1. Product Summary

SupplySure OS is a white-label B2B distribution and wholesale operations platform built on Next.js, React, Prisma, and SQLite. It is designed to help a distributor run the full operational cycle from master data and sales order intake through warehouse fulfilment, delivery, invoicing, payment collection, and branded customer documents.

The repository currently contains two connected applications:

1. Main operations app
   - Admin, sales, warehouse, accounts, and dispatcher-style workflows
   - Runs on port `3000`
2. Separate driver/courier app
   - Mobile-first PWA for delivery drivers
   - Runs on port `3001`
   - Talks to the core app through a server-side proxy

The product is already beyond a scaffold. There is real operational logic for:

- sales orders
- pick lists
- delivery routes and stops
- driver route execution
- invoice creation
- payment recording
- customer credit ledger updates
- branded PDF generation
- branded email payload generation

Some modules are still UI-first or partially mocked, and those are called out explicitly below.

## 2. Product Vision

Build a SaaS operating system for wholesale distributors that is:

- white-labeled for each customer’s own brand
- operationally connected across sales, warehouse, delivery, and finance
- usable by office staff and drivers in separate experiences
- extensible into a fuller multi-tenant ERP/TMS/WMS platform

## 3. Primary Users

### Admin

Owns company setup, overall operations visibility, settings, branding, users, and integrations.

### Sales Team

Manages customers, pricing, quotes, and sales orders.

### Warehouse Team

Manages products, inventory, purchase operations, pick queue, and route preparation.

### Accounts Team

Manages invoices, receivables, customer credit, and finance views.

### Driver / Courier

Uses the separate driver app to view assigned routes, navigate stops, capture proof of delivery, collect COD, and report exceptions.

## 4. Product Surfaces

### Main app

Located under [`src/app`](/Users/mihirsachdev/supplysure-os/src/app)

Key screens built:

- Dashboard
- Customers
- Customer Credit
- Products
- Inventory
- Pricing
- Quotes
- Sales Orders
- Warehouse Picking
- Routes & Delivery
- Invoices
- Suppliers
- Purchase Orders
- Returns
- Reports
- Finance Overview
- Banking
- Expenses
- General Ledger
- Settings
- API & Integrations
- AI Assistant

### Separate driver app

Located under [`apps/driver-app`](/Users/mihirsachdev/supplysure-os/apps/driver-app)

Key states built:

- driver sign-in
- active route dashboard
- stop detail
- proof of delivery capture
- exception reporting
- polling-based live refresh

## 5. Built Modules and Current Status

## 5.1 Live / API-backed / operational modules

### Company branding and SaaS white-labeling

- Company profile is stored in the `Company` model in [`prisma/schema.prisma`](/Users/mihirsachdev/supplysure-os/prisma/schema.prisma).
- Main company settings are exposed via [`src/app/api/settings/company/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/settings/company/route.ts).
- Branding helpers are implemented in [`src/lib/company-branding.ts`](/Users/mihirsachdev/supplysure-os/src/lib/company-branding.ts).
- Placeholder “SupplySure” branding is sanitized out so the tenant sees neutral or tenant-owned values instead of the platform brand.
- PDFs and outbound communication payloads use tenant branding.

### Products and categories

- Products and categories are persisted in Prisma.
- Pages are built in [`src/app/products/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/products/page.tsx).
- API routes exist for products and categories:
  - [`src/app/api/products/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/products/route.ts)
  - [`src/app/api/products/[id]/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/products/[id]/route.ts)
  - [`src/app/api/categories/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/categories/route.ts)

### Customers and credit

- Customer accounts and customer locations are persisted in Prisma.
- Customer management UI is in [`src/app/customers/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/customers/page.tsx).
- Credit dashboard is in [`src/app/customers/credit/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/customers/credit/page.tsx).
- Core customer API is in [`src/app/api/customers/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/customers/route.ts).
- Credit ledger records invoice charges and payment receipts via the `CreditTransaction` model.

### Suppliers

- Suppliers are persisted and manageable through:
  - UI: [`src/app/suppliers/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/suppliers/page.tsx)
  - API: [`src/app/api/suppliers/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/suppliers/route.ts)

### Inventory and warehouses

- Inventory is persisted per product/warehouse and supports stock movements.
- Warehouses are persisted in Prisma.
- Inventory UI is in [`src/app/inventory/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/inventory/page.tsx).
- APIs:
  - [`src/app/api/inventory/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/inventory/route.ts)
  - [`src/app/api/warehouses/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/warehouses/route.ts)

### Pricing engine

- Price list and customer pricing UI is implemented in [`src/app/pricing/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/pricing/page.tsx).
- Pricing API is implemented in [`src/app/api/pricing/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/pricing/route.ts).
- Product/customer-specific pricing structures exist in the schema via `PriceList` and related tables.

### Sales orders

- Sales orders are fully API-backed.
- UI exists in [`src/app/orders/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/orders/page.tsx).
- APIs exist in:
  - [`src/app/api/orders/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/orders/route.ts)
  - [`src/app/api/orders/[id]/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/orders/[id]/route.ts)
- Order numbers are generated dynamically by year.
- Order status flows through `draft`, `pending_approval`, `approved`, `picking`, `packed`, `dispatched`, `delivered`, `invoiced`, `cancelled`.
- Status history is persisted in `SalesOrderStatusLog`.

### Pick list generation and warehouse fulfilment

- Pick list generation logic is in [`src/lib/pick-lists.ts`](/Users/mihirsachdev/supplysure-os/src/lib/pick-lists.ts).
- Eligible orders automatically receive a pick list.
- Default warehouse assignment is auto-resolved if missing.
- Pick queue UI is in [`src/app/warehouse/picking/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/warehouse/picking/page.tsx).
- APIs:
  - [`src/app/api/pick-lists/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/pick-lists/route.ts)
  - [`src/app/api/pick-lists/[id]/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/pick-lists/[id]/route.ts)

### Delivery routes and deliveries

- Delivery route and stop orchestration is implemented in [`src/lib/delivery-routes.ts`](/Users/mihirsachdev/supplysure-os/src/lib/delivery-routes.ts).
- Driver-scoped route payload building is implemented in [`src/lib/driver-delivery.ts`](/Users/mihirsachdev/supplysure-os/src/lib/driver-delivery.ts).
- Admin route management UI is in [`src/app/routes/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/routes/page.tsx).
- Admin APIs:
  - [`src/app/api/routes/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/routes/route.ts)
  - [`src/app/api/routes/[id]/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/routes/[id]/route.ts)
  - [`src/app/api/drivers/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/drivers/route.ts)
  - [`src/app/api/deliveries/[id]/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/deliveries/[id]/route.ts)
- Packed/dispatched/delivered sales orders are backfilled into delivery routes and delivery stops.
- A default active driver can be auto-created if none exists.

### Separate driver app

- Separate app lives in [`apps/driver-app`](/Users/mihirsachdev/supplysure-os/apps/driver-app).
- It is a mobile-first PWA with its own manifest, icons, styling, and entry page.
- It does not talk to the database directly.
- It proxies to the core app through [`apps/driver-app/app/api/core/[...path]/route.ts`](/Users/mihirsachdev/supplysure-os/apps/driver-app/app/api/core/[...path]/route.ts).
- The proxy stores the driver session in an HTTP-only cookie named `driver_session`.
- Driver sign-in uses signed HMAC session tokens implemented in [`src/lib/driver-auth.ts`](/Users/mihirsachdev/supplysure-os/src/lib/driver-auth.ts).
- Driver APIs:
  - [`src/app/api/driver/session/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/driver/session/route.ts)
  - [`src/app/api/driver/me/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/driver/me/route.ts)
  - [`src/app/api/driver/route/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/driver/route/route.ts)
  - [`src/app/api/driver/stops/[id]/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/driver/stops/[id]/route.ts)
  - [`src/app/api/driver/stops/[id]/exception/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/driver/stops/[id]/exception/route.ts)
  - [`src/app/api/driver/uploads/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/driver/uploads/route.ts)
- Drivers can:
  - sign in
  - see their assigned route only
  - mark a stop `en_route`
  - mark a stop `arrived`
  - complete proof of delivery
  - upload proof files
  - capture recipient name, notes, COD, photo, and signature
  - report exceptions and returns
- Validation rules are enforced in [`src/lib/driver-stop-actions.ts`](/Users/mihirsachdev/supplysure-os/src/lib/driver-stop-actions.ts).

### Invoices and payments

- Invoice generation logic is implemented in [`src/lib/order-fulfillment.ts`](/Users/mihirsachdev/supplysure-os/src/lib/order-fulfillment.ts).
- Delivered orders can auto-create invoices if one does not exist.
- Invoice UI is in [`src/app/invoices/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/invoices/page.tsx).
- APIs:
  - [`src/app/api/invoices/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/invoices/route.ts)
  - [`src/app/api/invoices/[id]/payment/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/invoices/[id]/payment/route.ts)
- Payment posting updates:
  - invoice paid/outstanding amounts
  - invoice status
  - customer credit balance
  - customer credit transaction ledger

### Returns

- Returns are persisted in the `Return` and `ReturnItem` models.
- Returns UI is in [`src/app/returns/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/returns/page.tsx).
- API exists in [`src/app/api/returns/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/returns/route.ts).

### Dashboard and reports

- Main operational dashboard is live and dynamic in [`src/app/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/page.tsx).
- It aggregates live data from orders, customers, inventory, invoices, pick lists, and routes.
- Reports page is API-backed and aggregates core operational data in [`src/app/reports/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/reports/page.tsx).

### Branded PDFs and branded communications

- PDF components are implemented with `@react-pdf/renderer`:
  - [`src/components/documents/InvoicePDF.tsx`](/Users/mihirsachdev/supplysure-os/src/components/documents/InvoicePDF.tsx)
  - [`src/components/documents/SalesOrderPDF.tsx`](/Users/mihirsachdev/supplysure-os/src/components/documents/SalesOrderPDF.tsx)
  - [`src/components/documents/CustomerStatementPDF.tsx`](/Users/mihirsachdev/supplysure-os/src/components/documents/CustomerStatementPDF.tsx)
- Download helpers exist for invoice and sales order PDFs.
- Send modal exists in [`src/components/modals/SendDocumentModal.tsx`](/Users/mihirsachdev/supplysure-os/src/components/modals/SendDocumentModal.tsx).
- Communication API is in [`src/app/api/communications/route.ts`](/Users/mihirsachdev/supplysure-os/src/app/api/communications/route.ts).
- Emails are branded from tenant settings, not the platform brand.

## 5.2 Built but partially mocked / local-first / placeholder-heavy modules

These modules exist and are useful for product demos or UI coverage, but are not yet fully operational end to end:

### Quotes

- UI is in [`src/app/quotes/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/quotes/page.tsx).
- Loads customers/products from APIs.
- Quote persistence is currently localStorage-based, not Prisma/API-backed.
- Quote-to-order conversion currently uses browser localStorage handoff rather than a persisted backend workflow.

### Purchase orders

- UI is in [`src/app/purchase-orders/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/purchase-orders/page.tsx).
- Loads suppliers/products from APIs.
- Purchase order records are currently localStorage-based in the page implementation.
- Prisma schema contains `PurchaseOrder` and `PurchaseOrderItem`, so the data model exists for full backendization.

### Finance overview, banking, expenses, and ledger

- Pages exist:
  - [`src/app/finance/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/finance/page.tsx)
  - [`src/app/finance/banking/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/finance/banking/page.tsx)
  - [`src/app/finance/expenses/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/finance/expenses/page.tsx)
  - [`src/app/finance/ledger/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/finance/ledger/page.tsx)
- These screens are primarily demo/static data today.
- The schema already includes supporting models such as `ChartOfAccount`, `JournalEntry`, `Expense`, and `BankAccount`.

### AI Assistant

- UI exists in [`src/app/ai/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/ai/page.tsx).
- Current implementation is static insight/demo content.
- There is no connected model or live AI workflow behind it yet.

### Settings: user management, billing, subscription

- Company branding settings are live.
- Other settings sections in [`src/app/settings/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/settings/page.tsx) are largely presentation/demo content today.

### Integrations

- UI exists in [`src/app/integrations/page.tsx`](/Users/mihirsachdev/supplysure-os/src/app/integrations/page.tsx).
- Screen currently behaves like a configuration/mock integrations surface rather than a fully wired integration platform.

### Main app authentication

- The schema supports users and roles.
- Driver auth is implemented.
- The main app does not yet have a full login/session/RBAC enforcement flow wired through the UI.
- Current UI behaves like a single signed-in experience with role concepts present, but not fully enforced end to end.

## 6. How the Product Works End to End

## 6.1 Master data setup

1. Admin configures company branding, address, contact details, bank details, and invoice footer.
2. Products, categories, customers, suppliers, warehouses, and pricing structures are loaded into the system.
3. Inventory is stored per warehouse with reorder levels and stock movement support.

## 6.2 Order lifecycle

1. Sales order is created through the sales order UI.
2. Order gets a year-based dynamic order number.
3. Order progresses through status changes such as approval, picking, packing, dispatch, and delivery.
4. Status changes are logged to `SalesOrderStatusLog`.

## 6.3 Pick list lifecycle

1. Once an order is eligible, `ensurePickListForOrder()` creates or updates a pick list.
2. Pick list items mirror the sales order items.
3. Pick progress updates the pick list and item statuses.
4. Once all items are picked, the order can move toward packed/dispatched.

## 6.4 Route and delivery lifecycle

1. Packed, dispatched, or delivered orders are backfilled into route planning by `backfillDeliveryRoutes()`.
2. `ensureDeliveryForOrder()` creates:
   - a delivery route if needed
   - a delivery stop linked to the order
3. A default driver is created automatically if no active driver exists.
4. Route metrics are recalculated as stops progress.

## 6.5 Driver execution lifecycle

1. Driver signs into the separate driver app.
2. Driver app loads only that driver’s active route.
3. Driver can:
   - start travelling to a stop
   - mark arrival
   - complete proof of delivery
   - mark failure or return with required reason
4. Driver can upload proof assets.
5. Delivery validation rules enforce:
   - recipient name required for delivered stops
   - COD confirmation required when COD is due
   - exception reason required for failed stops

## 6.6 Order to invoice lifecycle

1. When a delivery stop is completed as `delivered`, the linked sales order is updated to `delivered`.
2. `ensureInvoiceForOrder()` creates an invoice if it does not already exist.
3. Invoice number is generated dynamically by year.
4. Customer credit balance is incremented and a credit ledger transaction is written.

## 6.7 Payment lifecycle

1. Payment is recorded against an invoice.
2. Invoice `paidAmount`, `outstandingAmt`, and status are updated.
3. Customer credit balance is reduced.
4. A `payment_received` credit ledger record is created.

## 6.8 Document and communication lifecycle

1. User can generate branded sales order, invoice, and statement PDFs.
2. Communication endpoint builds branded email subject/message using tenant company details.
3. Current communication API prepares and logs the payload; real ESP integration is the next production step.

## 7. Data Model Summary

The most important persisted entities are:

- `Company`
  - tenant branding, tax profile, addresses, bank details, invoice footer
- `User`
  - app users and drivers, role/status/license/vehicle
- `Category` and `Product`
  - catalogue and pricing base
- `Warehouse`, `Inventory`, `StockMovement`
  - stock by warehouse and stock movement history
- `Customer` and `CustomerLocation`
  - commercial account + delivery destinations
- `Quote`
  - quote model exists, but UI persistence is not yet backendized
- `SalesOrder` and `SalesOrderItem`
  - core operational sales entity
- `PickList` and `PickListItem`
  - warehouse execution layer
- `DeliveryRoute` and `Delivery`
  - transport execution layer
- `Invoice`, `Payment`, `CreditNote`
  - receivables and payment tracking
- `CreditTransaction`
  - customer credit ledger
- `Return` and `ReturnItem`
  - return merchandise workflow
- `PriceList`
  - customer/channel pricing
- `TaxRate`, `ChartOfAccount`, `JournalEntry`, `Expense`, `BankAccount`
  - financial/accounting foundation for future expansion

## 8. SaaS and White-Labeling Model

### White-label behavior

- Tenant company details power document branding and outbound communication.
- SupplySure platform references are sanitized out when placeholder seed data is present.
- Default fallback label is “Your Company”.

### Multi-tenant readiness

- Most major business entities contain `companyId`.
- The schema is designed for multi-company SaaS isolation.
- Current runtime behaves closer to a single active tenant context in the UI than a fully isolated multi-tenant auth platform.

### Multi-country readiness

- Country-aware schema fields exist for AU and IN tax/banking identities.
- Currency and tax helpers support AU and IN concepts in [`src/lib/types.ts`](/Users/mihirsachdev/supplysure-os/src/lib/types.ts) and [`src/lib/tax-engine.ts`](/Users/mihirsachdev/supplysure-os/src/lib/tax-engine.ts).
- Current seeded/runtime defaults still lean Australian operationally.

## 9. Technical Architecture

### Main stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS + shadcn/ui
- Prisma ORM
- SQLite database

### Main app architecture

- Client-heavy React pages under `src/app`
- Route handlers under `src/app/api`
- Business logic in `src/lib`
- PDF documents in `src/components/documents`

### Driver app architecture

- Separate Next.js app under `apps/driver-app`
- Server-side proxy to the main app
- Cookie-based driver session
- Mobile-first UI with installable PWA assets

### File upload architecture

- Driver proof uploads are saved to local disk under `public/uploads/driver-proof/:driverId`
- Upload endpoint returns public URLs to those assets

## 10. Key Product Strengths Already Built

- Real connection between order fulfilment and delivery execution
- Real connection between delivery completion and invoice generation
- Real connection between payment posting and customer credit ledger
- Separate driver experience instead of embedding everything in one admin UI
- Dynamic operational dashboard using live data
- White-label PDF and email payload support
- Multi-country schema foundation
- Clear modular separation of UI, APIs, and domain logic

## 11. Key Gaps / Known Limitations

These are the main areas still needed for a fuller SaaS launch:

- main app auth, session management, and true RBAC enforcement
- backend persistence for quotes
- backend persistence for purchase orders
- production-grade email sending integration
- production-grade object storage instead of local proof-file storage
- richer accounting engine wiring from invoices/payments/expenses into journals
- real integrations/webhooks/platform connectors beyond UI scaffolding
- real AI workflows instead of static AI demo content
- dispatcher-grade route planning optimization and GPS/ETA telemetry
- full multi-tenant tenant resolution and isolation in runtime

## 12. Recommended Near-Term Roadmap

### Phase 1: SaaS hardening

- Implement main app authentication
- Enforce tenant isolation via company context
- Replace localStorage quote and purchase order flows with APIs
- Add production email provider
- Add managed file storage for proof assets and logos

### Phase 2: Operational depth

- Route optimization and dispatcher tools
- Driver GPS pinging and live ETAs
- Warehouse receiving for purchase orders
- Quote approval and quote-to-order backend flow
- Exception queues for failed/returned deliveries

### Phase 3: Finance maturity

- Post payments/invoices into journal entries
- Bank reconciliation workflow
- Expense approvals and posting
- Credit notes and return-finance linkage

## 13. Bottom-Line Product Positioning

Today, the repository represents a credible early-stage SaaS distribution operating system with:

- strong order, pick, route, delivery, and invoice linkage
- white-label customer-facing output
- a separate driver product
- real APIs and domain logic in the core operations layer

It is not yet a fully production-hardened ERP across every module. The strongest production-like path today is:

products/customers/inventory/pricing -> sales orders -> pick lists -> routes/deliveries -> driver proof -> invoices -> payments -> branded documents

That is the clearest “working core” already built in this codebase.
