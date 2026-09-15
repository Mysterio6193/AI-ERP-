-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "baseTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'AUD',
ADD COLUMN     "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "baseTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'AUD',
ADD COLUMN     "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "decimals" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "fromCode" TEXT NOT NULL,
    "toCode" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_fromCode_toCode_effectiveFrom_idx" ON "ExchangeRate"("fromCode", "toCode", "effectiveFrom");

-- CreateIndex
CREATE INDEX "ExchangeRate_companyId_idx" ON "ExchangeRate"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_fromCode_toCode_effectiveFrom_companyId_key" ON "ExchangeRate"("fromCode", "toCode", "effectiveFrom", "companyId");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_fromCode_fkey" FOREIGN KEY ("fromCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_toCode_fkey" FOREIGN KEY ("toCode") REFERENCES "Currency"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Postgres treats NULLs as distinct in a unique index, so two shared rates
-- (companyId IS NULL) for the same pair and day would both be accepted and
-- the "rate on the 3rd" would be ambiguous. NULLS NOT DISTINCT makes the
-- constraint mean what the model says it means.
DROP INDEX "ExchangeRate_fromCode_toCode_effectiveFrom_companyId_key";
CREATE UNIQUE INDEX "ExchangeRate_fromCode_toCode_effectiveFrom_companyId_key"
  ON "ExchangeRate" ("fromCode", "toCode", "effectiveFrom", "companyId") NULLS NOT DISTINCT;
