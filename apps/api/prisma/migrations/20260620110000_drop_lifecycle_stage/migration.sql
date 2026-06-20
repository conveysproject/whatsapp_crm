-- Final cutover (2c): drop the legacy lifecycle_stage enum column, its index, and the enum type.
-- All consumers now use leadStatusId (LeadStatus).
DROP INDEX IF EXISTS "contacts_organization_id_lifecycle_stage_idx";
ALTER TABLE "contacts" DROP COLUMN "lifecycle_stage";
DROP TYPE "LifecycleStage";
