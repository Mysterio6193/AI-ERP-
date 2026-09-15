-- CreateTable
CREATE TABLE "AgentEventSubscription" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "filtersJson" TEXT,
    "companyId" TEXT,
    "maxPerHour" INTEGER NOT NULL DEFAULT 60,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 0,
    "cooldownKeyPath" TEXT,
    "prompt" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentEventSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEventLog" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "cooldownKey" TEXT,
    "ran" BOOLEAN NOT NULL,
    "reason" TEXT,
    "runId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentEventSubscription_eventType_enabled_idx" ON "AgentEventSubscription"("eventType", "enabled");

-- CreateIndex
CREATE INDEX "AgentEventSubscription_agentId_idx" ON "AgentEventSubscription"("agentId");

-- CreateIndex
CREATE INDEX "AgentEventSubscription_companyId_idx" ON "AgentEventSubscription"("companyId");

-- CreateIndex
CREATE INDEX "AgentEventLog_subscriptionId_startedAt_idx" ON "AgentEventLog"("subscriptionId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentEventLog_eventId_idx" ON "AgentEventLog"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentEventLog_subscriptionId_eventId_key" ON "AgentEventLog"("subscriptionId", "eventId");

-- AddForeignKey
ALTER TABLE "AgentEventSubscription" ADD CONSTRAINT "AgentEventSubscription_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEventSubscription" ADD CONSTRAINT "AgentEventSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEventLog" ADD CONSTRAINT "AgentEventLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "AgentEventSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEventLog" ADD CONSTRAINT "AgentEventLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

