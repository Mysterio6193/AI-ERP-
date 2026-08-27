-- CreateTable
CREATE TABLE "AgentGroupChannel" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "autoReply" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentGroupChannel_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "AgentGroupChannel_status_idx" ON "AgentGroupChannel"("status");
-- CreateIndex
CREATE UNIQUE INDEX "AgentGroupChannel_channel_externalId_key" ON "AgentGroupChannel"("channel", "externalId");
