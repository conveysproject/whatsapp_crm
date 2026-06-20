-- ContactImport: replace lifecycle_stage enum column with nullable lead_status_id (audit field)
ALTER TABLE "contact_imports" ADD COLUMN "lead_status_id" TEXT;
ALTER TABLE "contact_imports" DROP COLUMN "lifecycle_stage";
