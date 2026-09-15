-- AlterTable
ALTER TABLE "PickListItem" ADD COLUMN     "batchCode" TEXT,
ADD COLUMN     "binId" TEXT;


-- CreateTable
CREATE TABLE "BinLocation" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "aisle" INTEGER NOT NULL,
    "rack" INTEGER NOT NULL,
    "level" INTEGER NOT NULL,
    "pickSequence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPickable" BOOLEAN NOT NULL DEFAULT true,
    "maxUnits" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BinLocation_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "BinStock" (
    "id" TEXT NOT NULL,
    "binId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "batchId" TEXT,
    "batchCode" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BinStock_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE INDEX "BinLocation_warehouseId_pickSequence_idx" ON "BinLocation"("warehouseId", "pickSequence");


-- CreateIndex
CREATE INDEX "BinLocation_warehouseId_status_idx" ON "BinLocation"("warehouseId", "status");


-- CreateIndex
CREATE UNIQUE INDEX "BinLocation_warehouseId_code_key" ON "BinLocation"("warehouseId", "code");


-- CreateIndex
CREATE INDEX "BinStock_productId_idx" ON "BinStock"("productId");


-- CreateIndex
CREATE INDEX "BinStock_batchId_idx" ON "BinStock"("batchId");


-- CreateIndex
CREATE UNIQUE INDEX "BinStock_binId_productId_batchCode_key" ON "BinStock"("binId", "productId", "batchCode");


-- CreateIndex
CREATE INDEX "PickListItem_binId_idx" ON "PickListItem"("binId");


-- AddForeignKey
ALTER TABLE "BinLocation" ADD CONSTRAINT "BinLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BinStock" ADD CONSTRAINT "BinStock_binId_fkey" FOREIGN KEY ("binId") REFERENCES "BinLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BinStock" ADD CONSTRAINT "BinStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BinStock" ADD CONSTRAINT "BinStock_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "PickListItem" ADD CONSTRAINT "PickListItem_binId_fkey" FOREIGN KEY ("binId") REFERENCES "BinLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
