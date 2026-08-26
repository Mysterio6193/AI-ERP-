-- AlterTable
ALTER TABLE "IntegrationConnection" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'user';
-- CreateIndex
CREATE INDEX "IntegrationConnection_companyId_provider_scope_idx" ON "IntegrationConnection"("companyId", "provider", "scope");
