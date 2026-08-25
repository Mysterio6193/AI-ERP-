-- CreateTable
CREATE TABLE "EndUserProduct" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "estimatedQty" DOUBLE PRECISION,
    "period" TEXT NOT NULL DEFAULT 'week',
    "unit" TEXT,
    "viaDistributorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'using',
    "competitorProduct" TEXT,
    "lastConfirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'rep_visit',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EndUserProduct_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "EndUserProduct_productId_status_idx" ON "EndUserProduct"("productId", "status");
-- CreateIndex
CREATE INDEX "EndUserProduct_viaDistributorId_idx" ON "EndUserProduct"("viaDistributorId");
-- CreateIndex
CREATE UNIQUE INDEX "EndUserProduct_customerId_productId_key" ON "EndUserProduct"("customerId", "productId");
-- AddForeignKey
ALTER TABLE "EndUserProduct" ADD CONSTRAINT "EndUserProduct_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EndUserProduct" ADD CONSTRAINT "EndUserProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EndUserProduct" ADD CONSTRAINT "EndUserProduct_viaDistributorId_fkey" FOREIGN KEY ("viaDistributorId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "EndUserProduct" ADD CONSTRAINT "EndUserProduct_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
