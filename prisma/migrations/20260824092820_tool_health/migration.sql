-- CreateTable
CREATE TABLE "ToolHealth" (
    "id" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lastFailedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolHealth_toolName_key" ON "ToolHealth"("toolName");

-- CreateIndex
CREATE INDEX "ToolHealth_consecutiveFailures_idx" ON "ToolHealth"("consecutiveFailures");

