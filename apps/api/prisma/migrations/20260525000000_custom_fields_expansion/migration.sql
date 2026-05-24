-- AlterTable
ALTER TABLE "contact_custom_fields"
  ADD COLUMN IF NOT EXISTS "field_key"     TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "description"   TEXT,
  ADD COLUMN IF NOT EXISTS "placeholder"   TEXT,
  ADD COLUMN IF NOT EXISTS "default_value" TEXT,
  ADD COLUMN IF NOT EXISTS "options"       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "is_required"   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "is_read_only"  BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill field_key from input_name for any pre-existing rows
UPDATE "contact_custom_fields"
SET "field_key" = lower(regexp_replace("input_name", '[^a-zA-Z0-9]+', '_', 'g'))
WHERE "field_key" = '';

ALTER TABLE "contact_custom_fields"
  ALTER COLUMN "field_key" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contact_custom_fields_organization_id_field_key_key"
  ON "contact_custom_fields"("organization_id", "field_key");
