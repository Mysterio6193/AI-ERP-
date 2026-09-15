-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "groupEntityId" TEXT;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_groupEntityId_fkey" FOREIGN KEY ("groupEntityId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

