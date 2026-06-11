-- AddColumn: multi-channel fields on organizations
ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "facebook_page_id" TEXT,
  ADD COLUMN IF NOT EXISTS "instagram_account_id" TEXT,
  ADD COLUMN IF NOT EXISTS "meta_business_id" TEXT;
