# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Warehouse & Inventory Operators / Logistics Managers**: Manage physical warehouse layout, bin/aisle assignments, lot/batch tracking, expiry dates, wave picking, packing manifests, and inter-warehouse stock transfers.
- **Dispatchers & Logistics Coordinators**: Create and optimize delivery runs, assign drivers and fleet vehicles, monitor live transit status, and handle dispatch exceptions.
- **Delivery Drivers & Couriers**: Use the mobile-first Driver PWA (`apps/driver-app`) on smartphones/tablets to navigate assigned routes, capture photographic proof of delivery (POD), collect customer e-signatures, record cash on delivery (COD), and log exceptions.
- **Procurement & Sourcing Specialists**: Manage vendor catalogs, supplier price tiers, lead times, purchase orders (POs), and review automated replenishment recommendations from AI agents.
- **Sales & Customer Accounts Representatives**: Manage B2B customer accounts, customer-specific price matrices, credit limits, quotes, and convert approved orders into fulfilment pipelines.
- **Finance, Accounting & Compliance Officers**: Oversee double-entry general ledger, automated invoicing, chart of accounts, credit ledger transactions, bank reconciliation, and multi-jurisdiction tax compliance (Australia ATO/GST & India GST/e-Invoicing).
- **Executive & System Administrators**: Configure multi-entity legal structures, company white-label parameters, RBAC role permissions, and autonomous AI agent policy guardrails.

## Product Purpose

SupplySure OS is an AI-native enterprise resource planning (ERP) and intelligent supply chain operating system designed specifically for wholesale distributors, manufacturers, and multi-location logistics hubs. It connects the full operational cycle from procurement and warehouse fulfillment through last-mile delivery, double-entry financial settlement, and autonomous background intelligence into a single cohesive platform.

Success means eliminating manual data re-entry across disconnected software silos, preventing stockouts with intelligent replenishment forecasting, accelerating order-to-cash cycles with instant driver POD-triggered invoicing, and maintaining spotless double-entry audit trails across multi-entity operations.

## Positioning

Unlike legacy ERP systems (such as SAP, NetSuite, or Odoo) which treat AI as an add-on chatbot and require brittle third-party integrations for driver delivery apps and warehouse scanning, SupplySure OS delivers:
- An integrated, decoupled driver PWA with native camera and signature capture that directly triggers real-time ledger and inventory actions upon delivery.
- Built-in multi-jurisdiction double-entry accounting and tax localization (supporting Australia ATO/GST and India GST e-invoicing).
- Deeply embedded, event-driven autonomous AI agents operating with structured human-in-the-loop guardrails to triage inbound communications, generate replenishment purchase orders, and forecast demand without manual friction.

## Operating Context

- **Physical Environments**: Rugged warehouse loading docks, forklift-mounted terminals, high-paced fulfillment packing stations, driver vehicle cabs on the road, and back-office finance/sales workstations.
- **Operational Cadence & Rituals**: Morning automated briefing broadcasts via Telegram/Email; daily wave picking runs; morning dispatch route lock-in; real-time driver delivery runs; end-of-day driver cash settlement and bank reconciliations; periodic background AI replenishment scans.
- **Documents & Artifacts**: Branded PDF Invoices, Packing Slips, Pick Lists, Purchase Orders, Delivery Run Sheets, Proof of Delivery (POD) photo/signature receipts, and General Ledger double-entry Journal entries.

## Capabilities and Constraints

- **Full Supply Chain Lifecycle**: Dynamic Purchase Order generation, Supplier Scorecards, Warehouse Receiving QC, Multi-Warehouse Bin & Aisle tracking, Lot & Expiry tracking, Sales Order approvals with credit limit validation, Wave picking queues, Dispatch route clustering, Driver PWA execution, and Double-entry General Ledger.
- **Multi-Tenancy & Legal Entities**: Multi-entity tenancy supporting multiple ABNs/GSTINs with active-company contextual switching.
- **Autonomous Agent Guardrails**: AI replenishment and email triage agents operate under strict policy thresholds, drafting actions and requiring human approval above specified monetary/quantity limits.
- **Technical Architecture**:
  - Core ERP: Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui & Radix UI.
  - Driver App: Decoupled Next.js PWA (`apps/driver-app`) communicating via HTTP proxy with HTTP-only cookie sessions.
  - Backend/Data: Prisma ORM with PostgreSQL (embedded scripts/pg.mjs in dev), Vercel AI SDK (`ai` v7).
  - Security: Deny-by-default layered RBAC (`src/middleware.ts` + route-level `src/lib/permissions.ts`).

## Brand Commitments

- **Platform Identity**: "SupplySure OS" / Neutral B2B Distribution Operating System.
- **White-Label Architecture**: Full white-labeling support where customer company branding (company name, logo, tax identifiers, colors, header/footer styling) dynamically overrides system placeholders across all customer-facing interfaces, PDFs, and email communications.
- **Voice & Tone**: High-precision, authoritative, crisp enterprise tone. Clear status indicators without ambiguous jargon.

## Evidence on Hand

- 87 Prisma database models defining the enterprise schema (`prisma/schema.prisma`).
- 134+ Next.js API route handlers under `src/app/api/`.
- Working domain engines in `src/lib/` (ledger, tax, pricing, invoicing, freight, returns, reservations, delivery routes, pick lists).
- Autonomous AI agent framework with Telegram channels, scheduler, and tool modules in `src/lib/agent/`.
- Functional driver PWA in `apps/driver-app/`.
- Pure logic test suites configured via Vitest (`src/**/*.test.ts`) and database flow verification scripts in `scripts/verify-*.ts`.

## Product Principles

1. **Single Source of Operational Truth**: An event at the edge (such as a driver capturing a POD signature) immediately cascades through inventory decrements, customer credit updates, tax invoice generation, and double-entry general ledger entries.
2. **Autonomous AI with Deterministic Guardrails**: AI agents automate repetitive forecasting, email triage, and replenishment drafting, while financial and high-stakes operational commits always pass through explicit human policy gates.
3. **Frictionless Edge Affordances**: The mobile driver experience and warehouse picking workflows are optimized for speed, high-contrast readability, one-thumb interactions, and offline-tolerant resilience.
4. **Strict Enterprise Security & Multi-Entity Isolation**: Deny-by-default RBAC and strict multi-company tenancy isolation prevent data leakage across organizational entities and operational roles.

## Accessibility & Inclusion

- WCAG 2.1 AA compliance across core web ERP dashboard.
- High-contrast visual elements, clear touch targets (minimum 44x44px), and keyboard navigability across tabular data and wave-picking lists.
- Sunlight-readable high-contrast UI and large hit targets for driver mobile PWA in outdoor/in-vehicle usage.
