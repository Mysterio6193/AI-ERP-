-- Change InventoryBatch.inventory relation from ON DELETE CASCADE to
-- ON DELETE RESTRICT.
--
-- InventoryBatch rows are the lot/batch-level record HACCP recall
-- traceability depends on (see the model comment in schema.prisma). With
-- CASCADE, deleting an Inventory row (a product/warehouse pairing) silently
-- destroyed all batch history for that pairing, including batches already
-- fully consumed to zero quantity -- which is exactly what still needs to
-- be traceable for a recall. RESTRICT makes Postgres refuse the delete
-- while any InventoryBatch still references the Inventory row, forcing an
-- explicit decision (archive the batches, or route through a proper
-- decommission flow) instead of quietly losing the record.

-- DropForeignKey
ALTER TABLE "InventoryBatch" DROP CONSTRAINT "InventoryBatch_inventoryId_fkey";

-- AddForeignKey
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
