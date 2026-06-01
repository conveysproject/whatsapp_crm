-- Remove B2B companies feature (not used in single-org model)
ALTER TABLE "contacts" DROP COLUMN IF EXISTS "company_id";
DROP TABLE IF EXISTS "companies";
