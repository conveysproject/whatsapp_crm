ALTER TABLE "contact_imports" ADD COLUMN IF NOT EXISTS "batch_group_ids" TEXT[] NOT NULL DEFAULT '{}';
