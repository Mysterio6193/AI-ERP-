-- DropIndex
DROP INDEX "Invoice_invoiceNumber_key";

-- DropIndex
DROP INDEX "PurchaseOrder_poNumber_key";

-- DropIndex
DROP INDEX "SalesOrder_orderNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_companyId_key" ON "Invoice"("invoiceNumber", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_companyId_key" ON "PurchaseOrder"("poNumber", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNumber_companyId_key" ON "SalesOrder"("orderNumber", "companyId");

