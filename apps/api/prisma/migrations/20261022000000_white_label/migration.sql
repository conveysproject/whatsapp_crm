-- White-label website. Additive only.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_name" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_color" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_support_email" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "white_label_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "brand_hide_powered_by" BOOLEAN NOT NULL DEFAULT false;
