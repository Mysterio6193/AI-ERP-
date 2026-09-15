-- CreateTable
CREATE TABLE "ProductionConsumptionLot" (
    "id" TEXT NOT NULL,
    "consumptionId" TEXT NOT NULL,
    "batchId" TEXT,
    "batchCode" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionConsumptionLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductionConsumptionLot_consumptionId_idx" ON "ProductionConsumptionLot"("consumptionId");

-- CreateIndex
CREATE INDEX "ProductionConsumptionLot_batchCode_idx" ON "ProductionConsumptionLot"("batchCode");

-- CreateIndex
CREATE INDEX "ProductionConsumptionLot_batchId_idx" ON "ProductionConsumptionLot"("batchId");

-- AddForeignKey
ALTER TABLE "ProductionConsumptionLot" ADD CONSTRAINT "ProductionConsumptionLot_consumptionId_fkey" FOREIGN KEY ("consumptionId") REFERENCES "ProductionConsumption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionConsumptionLot" ADD CONSTRAINT "ProductionConsumptionLot_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

