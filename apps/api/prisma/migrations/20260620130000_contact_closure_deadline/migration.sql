-- 3b: closure deadline tracking on contacts
ALTER TABLE "contacts" ADD COLUMN "closure_deadline" TIMESTAMP(3);
ALTER TABLE "contacts" ADD COLUMN "closure_alerted_at" TIMESTAMP(3);
CREATE INDEX "contacts_organization_id_closure_deadline_idx" ON "contacts"("organization_id", "closure_deadline");
