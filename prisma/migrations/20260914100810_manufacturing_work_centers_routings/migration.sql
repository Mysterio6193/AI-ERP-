-- CreateTable
CREATE TABLE "WorkCenter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "warehouseId" TEXT,
    "minutesPerDay" INTEGER,
    "parallelCapacity" INTEGER NOT NULL DEFAULT 1,
    "efficiencyPercent" DOUBLE PRECISION,
    "costPerHour" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "setupMinutes" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkCenter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutingOperation" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "workCenterId" TEXT,
    "setupMinutes" INTEGER,
    "runMinutesPerUnit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "queueMinutes" INTEGER,
    "moveMinutes" INTEGER,
    "scrapPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOperation" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "workCenterId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "plannedSetupMinutes" INTEGER NOT NULL DEFAULT 0,
    "plannedRunMinutes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "actualMinutes" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "goodQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "scrapQty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "laborCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operatorId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkCenter_warehouseId_status_idx" ON "WorkCenter"("warehouseId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCenter_code_companyId_key" ON "WorkCenter"("code", "companyId");

-- CreateIndex
CREATE INDEX "RoutingOperation_workCenterId_idx" ON "RoutingOperation"("workCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "RoutingOperation_bomId_sequence_key" ON "RoutingOperation"("bomId", "sequence");

-- CreateIndex
CREATE INDEX "ProductionOperation_workCenterId_status_idx" ON "ProductionOperation"("workCenterId", "status");

-- CreateIndex
CREATE INDEX "ProductionOperation_scheduledStart_idx" ON "ProductionOperation"("scheduledStart");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOperation_productionOrderId_sequence_key" ON "ProductionOperation"("productionOrderId", "sequence");

-- AddForeignKey
ALTER TABLE "WorkCenter" ADD CONSTRAINT "WorkCenter_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingOperation" ADD CONSTRAINT "RoutingOperation_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "BillOfMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutingOperation" ADD CONSTRAINT "RoutingOperation_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOperation" ADD CONSTRAINT "ProductionOperation_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "WorkCenter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

