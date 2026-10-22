-- White-label approval is bound to a brand revision. Additive only.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_revision" INTEGER NOT NULL DEFAULT 0;
