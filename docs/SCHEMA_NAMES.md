# Schema names that get guessed wrong

Every entry below is a real mistake that shipped and had to be fixed. They share
a cause: the plausible name was used instead of the actual column, and
`tsc` only catches it once the code is written — it does **not** validate
Prisma `where` clauses, so a green typecheck is not proof a query is valid.

Check here before writing a query against these models.

## The build now refuses to break

A pre-commit hook runs `tsc --noEmit` and refuses a commit that does not
typecheck. It exists because the build was broken by a commit four separate
times, always this way. Enable it in a fresh clone with:

    git config core.hooksPath .githooks

Skip it deliberately with `git commit --no-verify`.

## Fields that do not exist

| Guessed | Real | Model |
|---|---|---|
| `code` | *nothing* — use `abn`, or the id | `Supplier`, `Customer` |
| `contactName` | `contactPerson` | `Supplier`, `Customer` |
| `paymentTermsDays` | `paymentTerms` (Int, days) | `Supplier`, `Customer` |
| `leadTimeDays` | `leadTime` on **`ProductSupplier`**, not on `Supplier` | — |
| `basePrice` | `wholesalePrice` (also `retailPrice`, `costPrice`) | `Product` |
| `unit` | `baseUnit` (also `packSize`, `packUnit`) | `Product` |
| `totalAmount` | `amount` + `taxAmount`, both **Decimal** | `CreditNote` |
| `yieldQuantity` | `yieldQty` | `BillOfMaterial` |
| `componentProduct` | `component` | `BomLine` |
| `batchNumber` | `batchCode` | `InventoryBatch` |
| `initialQty` / `currentQty` | `quantity`, `reserved` | `InventoryBatch` |
| `isQuarantined` | `status === "quarantined"` | `InventoryBatch` |
| `dueDate` | `dueAt` | `CrmTask` |
| `description` | `notes` | `CrmTask` |
| `title` | `name` | `Opportunity` |
| `estimatedValue` | `value` | `Opportunity` |
| `description` | *nothing* — a lost deal has `lossReason` | `Opportunity` |
| `notes` | `customerNotes` / `internalNotes` | `SalesOrder` |
| `notes` | *nothing* — `Activity` is the timeline | `Customer` |
| `content` | `body` | `Activity` |

## Models under a different name

| Guessed | Real |
|---|---|
| `db.task` | `db.crmTask` — and `type` is required on create |
| `db.batch` | `db.inventoryBatch` |

## Relations that do not exist

These carry the foreign key but have **no relation field**, so `include` fails.
Resolve the names in one grouped query instead of joining per row.

- `Supplier` → `InventoryBatch` — batches hold `supplierId` only
- `InventoryBatch` → `Product` / `Supplier` — ids only
- `CrmTask` → `User` — `assignedToId` only

`Product.category` **is** a relation, so it must be `include`d before
`product.category.name` can be read. `product.category` on its own is not a
string.

## Decimal columns

`Payment.amount`, `CreditNote.amount` and `CreditNote.taxAmount` are `Decimal`.
`sum + row.amount` concatenates rather than adds — coerce with `Number()` first.

## Company

Editing a company must go through `getActiveCompany(request)`. Resolving with
`db.company.findFirst()` writes to whichever row is first, which in a
multi-entity group means saving one entity's bank details onto another's
invoices. The one exception is the ledger fallback in `resolveLedgerCompanyId`,
where an unattributed journal must still land somewhere.

## Document numbers

`Invoice.invoiceNumber`, `SalesOrder.orderNumber` and `PurchaseOrder.poNumber`
are unique **per company**, not globally — two entities each having their own
`INV-2026-01001` is correct.

## Two mistakes that are not naming

**A relation filtered as a string.** `product: { category: { equals: "x" } }`
does not narrow a relation — and it breaks the *whole query's* typing, so
`inv.product` collapses too and you get a cascade of unrelated-looking errors.
Filter the relation's own field: `category: { name: { equals: "x" } }`.

**`const rows = []` infers `never[]`.** Every `push` into it then fails. Declare
the element type, and declare it concretely rather than as
`Record<string, unknown>` — the loose version makes every value `unknown`, so
any sum computed from those rows fails next.
