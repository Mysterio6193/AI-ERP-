-- CreateTable
CREATE TABLE "LotShipment" (
    "id" TEXT NOT NULL,
    "batchCode" TEXT NOT NULL,
    "batchId" TEXT,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT,
    "customerId" TEXT NOT NULL,
    "shippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotShipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LotShipment_batchCode_idx" ON "LotShipment"("batchCode");

-- CreateIndex
CREATE INDEX "LotShipment_productId_idx" ON "LotShipment"("productId");

-- CreateIndex
CREATE INDEX "LotShipment_customerId_idx" ON "LotShipment"("customerId");

-- CreateIndex
CREATE INDEX "LotShipment_orderId_idx" ON "LotShipment"("orderId");

-- AddForeignKey
ALTER TABLE "LotShipment" ADD CONSTRAINT "LotShipment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotShipment" ADD CONSTRAINT "LotShipment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotShipment" ADD CONSTRAINT "LotShipment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotShipment" ADD CONSTRAINT "LotShipment_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotShipment" ADD CONSTRAINT "LotShipment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

