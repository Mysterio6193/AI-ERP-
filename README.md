# 📦 SupplySure OS — AI-Powered B2B ERP & Supply Chain Operating System

![SupplySure OS Banner](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)
![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38bdf8?style=for-the-badge&logo=tailwindcss)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)
![AI SDK](https://img.shields.io/badge/Vercel-AI_SDK-black?style=for-the-badge)

SupplySure OS is a modern, enterprise-grade, **AI-native ERP and supply chain management platform** engineered for wholesale distributors, B2B commerce, multi-warehouse logistics, and manufacturing. 

It unifies inventory, procurement, order fulfillment, driver dispatch, double-entry accounting, CRM, and autonomous AI agents into a single high-performance platform.

---

## 🌟 Key Features & Modules

### 🤖 1. Autonomous AI Agents & Intelligence
- **Supply Chain Co-Pilot**: Automated reorder recommendations, demand forecasting, and inventory optimization.
- **Autonomous Agents**: Autonomous background agents capable of triaging customer emails, Telegram messages, invoice processing, and supplier negotiations.
- **Flexible LLM Support**: Compatible with local models (via Ollama / Muse Glimmer) or cloud models (Anthropic Claude, OpenAI, Vercel AI Gateway).

### 🏢 2. Multi-Tenancy & Multi-Country Compliance
- **Australia**: Built-in support for ABN/ACN validation, 10% GST engine, BSB/Account banking formats.
- **India**: Integrated GSTIN, PAN, TAN, CIN compliance, Indian state tax matrices, IFSC/UPI banking details.
- **Customizable Fiscal Years**: Support for AU (July start) and IN (April start) accounting cycles.

### 📦 3. Inventory & Multi-Warehouse Management
- **Real-Time Stock Tracking**: Stock on hand, committed, incoming, and safety stock levels.
- **Multi-Location & Bin Mapping**: Granular warehouse, aisle, shelf, and bin tracking.
- **Batch & Expiry Control**: Lot numbers, serial numbers, and expiry date management.
- **Automated Stock Movements**: Inter-warehouse transfers, stock adjustments, and cycle counting.

### 📑 4. Order Management & Fulfillment
- **Sales Orders & Quotes**: Quote-to-order conversion, tiered customer pricing, discount rules.
- **Purchase Orders**: Automated supplier PO creation, receiving workflows, partial delivery tracking.
- **Pick, Pack & Dispatch**: Barcode scanning support, automated packing slips, shipping labels.

### 🚚 5. Logistics, Routing & Driver Mobile App
- **Route Optimization**: Multi-stop delivery route planning and dynamic driver assignment.
- **Dedicated Driver App (`apps/driver-app`)**: Mobile-first progressive web app for drivers with:
  - Turn-by-turn route overview
  - Digital Proof of Delivery (POD)
  - Signature capture and photo upload
  - Live delivery status sync

### 💰 6. Finance & Double-Entry Accounting
- **Invoicing & Payments**: PDF invoice generation (`@react-pdf/renderer`), Stripe payment integration.
- **Double-Entry Bookkeeping**: Full Chart of Accounts, automated journal entries, and general ledger.
- **Bank Reconciliation & Expenses**: Multi-account bank feeds, transaction matching, expense auditing.
- **Credit Applications**: Built-in customer credit approval workflows and credit limit enforcement.

### 🤝 7. B2B CRM & Customer Portal
- **Customer Directory**: Tiered customer accounts, price lists, terms, and purchase history.
- **Credit Management**: Enforced credit limits, payment terms, and aging AR reports.
- **Omnichannel Inbox**: Unified customer messaging across email, SMS, and messaging bots.

### 🏭 8. Production & Reverse Logistics
- **Manufacturing / Assembly**: Bill of Materials (BOM) management and production order scheduling.
- **RMA & Returns**: Structured return authorizations, quality inspection, restock, or write-off workflows.

---

## 🛠️ Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [TypeScript 5](https://www.typescriptlang.org/) |
| **Styling & UI** | [Tailwind CSS 4](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [Radix UI](https://www.radix-ui.com/), [Lucide React](https://lucide.dev/), [Framer Motion](https://www.framer.com/motion/) |
| **State & Data Fetching** | [Zustand](https://zustand-demo.pmnd.rs/), [TanStack Query v5](https://tanstack.com/query/latest), [TanStack Table v8](https://tanstack.com/table/latest) |
| **Forms & Validation** | [React Hook Form](https://react-hook-form.com/), [Zod 4](https://zod.dev/) |
| **Backend & ORM** | Next.js API Routes, [Prisma ORM 6](https://www.prisma.io/) (SQLite for local dev / PostgreSQL for prod) |
| **Authentication & RBAC** | Custom RBAC (`ADMIN`, `SALES`, `WAREHOUSE`, `DRIVER`, `ACCOUNTS`, `OPERATIONS`) & NextAuth.js |
| **AI & LLM Integration** | [Vercel AI SDK](https://sdk.vercel.ai/), OpenAI-compatible endpoints, Ollama |
| **Documents & Exports** | [@react-pdf/renderer](https://react-pdf.org/) for PDF Invoices & Purchase Orders |
| **Testing** | [Vitest](https://vitest.dev/) |

---

## 📂 Project Structure

```text
├── apps/
│   └── driver-app/            # Standalone mobile-first Next.js driver application
├── prisma/
│   ├── schema.prisma          # Comprehensive enterprise Prisma schema (2800+ lines)
│   └── migrations/            # Database migration history
├── public/                    # Static assets & runtime uploads
├── scripts/                   # Production bootstrap & helper scripts
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/            # Authentication routes & signin
│   │   ├── ai/                # AI Co-pilot & agent management UI
│   │   ├── api/               # RESTful API endpoints (RBAC-protected)
│   │   ├── carriers/          # Shipping carrier management
│   │   ├── categories/        # Product taxonomy
│   │   ├── commerce/          # B2B commerce settings
│   │   ├── credit-applications/ # Credit limit approvals
│   │   ├── crm/               # CRM & lead pipelines
│   │   ├── customers/         # Customer directory & price tiers
│   │   ├── driver/            # Core app driver dispatch views
│   │   ├── finance/           # Invoicing, COA, journals, bank reconciliation
│   │   ├── inventory/         # Stock levels, movements, batch tracking
│   │   ├── orders/            # Sales orders & fulfillment
│   │   ├── pricing/           # Tiered price lists & bulk discounts
│   │   ├── production/        # Bill of Materials & assembly
│   │   ├── products/          # Catalog & SKU management
│   │   ├── purchase-orders/   # Supplier POs & receiving
│   │   ├── quotes/            # Sales quote workflows
│   │   ├── reports/           # Financial & inventory analytics
│   │   ├── returns/           # RMA & reverse logistics
│   │   ├── routes/            # Delivery route scheduling
│   │   ├── settings/          # System & company settings
│   │   ├── suppliers/         # Supplier directory & management
│   │   ├── users/             # User & role management
│   │   └── warehouses/        # Multi-warehouse & bin locations
│   ├── components/            # Reusable UI components & shadcn widgets
│   ├── hooks/                 # Custom React hooks
│   └── lib/                   # Auth guards, database clients, permissions, utilities
├── .env.example               # Environment variable templates
├── package.json               # Monorepo/Core dependencies & scripts
├── tsconfig.json              # TypeScript configuration
└── vitest.config.ts           # Test configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.18+ (or v20+ recommended)
- **Package Manager**: `npm`, `pnpm`, or `bun`

### 1. Clone the Repository
```bash
git clone https://github.com/Mysterio6193/AI-ERP-.git
cd AI-ERP-
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

Key environment configurations:
- `DATABASE_URL`: Defaults to `"file:./db/dev.db"` for local SQLite development.
- `ADMIN_SESSION_SECRET`: Random secure string (generate via `openssl rand -base64 48`).
- `DRIVER_SESSION_SECRET`: Random secure string for the Driver App.
- `AUTH_BYPASS`: Set to `"true"` in local development to bypass authentication gates.
- `AGENT_PROVIDER`: `"local"` (Ollama / Muse) or `"gateway"` (OpenAI, Claude).

### 4. Initialize the Database
```bash
# Push Prisma schema to local database
npm run db:push

# Generate Prisma client
npm run db:generate
```

### 5. Start the Development Servers

**Core ERP Application (Port 3000):**
```bash
npm run dev
```

**Driver Mobile App (Port 3001):**
```bash
npm run dev:driver
```

Access the core application at: [http://localhost:3000](http://localhost:3000)  
Access the driver application at: [http://localhost:3001](http://localhost:3001)

---

## 🧪 Running Tests

SupplySure OS includes an automated test suite powered by [Vitest](https://vitest.dev/):

```bash
# Run all unit and integration tests
npm run test

# Run tests in watch mode
npm run test:watch
```

---

## 📦 Building for Production

To create an optimized production build:

```bash
# Build core ERP application
npm run build

# Build Driver App
npm run build:driver

# Start production server
npm run start
```

---

## 🔒 Security & Access Control

SupplySure OS enforces strict Role-Based Access Control (RBAC) across all routes:
- **`ADMIN` / `EXECUTIVE`**: Full administrative access across all modules.
- **`OPERATIONS` / `WAREHOUSE`**: Stock adjustments, pick & pack, shipments, and inventory transfers.
- **`SALES`**: Quotes, sales orders, customer directory, and pricing.
- **`ACCOUNTS`**: Invoices, journal entries, bank reconciliations, and credit applications.
- **`DRIVER`**: Limited to assigned delivery routes, proof-of-delivery uploads, and stop updates.

---

## 📄 License

This project is private and proprietary. All rights reserved.
