-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "channelRole" TEXT NOT NULL DEFAULT 'direct',
ADD COLUMN     "suppliedById" TEXT;
-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_suppliedById_fkey" FOREIGN KEY ("suppliedById") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
