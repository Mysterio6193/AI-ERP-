-- AlterTable
ALTER TABLE "QuoteItem" ADD COLUMN     "priceListItemId" TEXT,
ADD COLUMN     "priceSource" TEXT;

-- AlterTable
ALTER TABLE "SalesOrderItem" ADD COLUMN     "priceListItemId" TEXT,
ADD COLUMN     "priceSource" TEXT;

