-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "sales_cycle_entered_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "contacts_organization_id_sales_cycle_entered_at_idx" ON "contacts"("organization_id", "sales_cycle_entered_at");
