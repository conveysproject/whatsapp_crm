-- AlterTable: Organization - add white-label & billing fields
ALTER TABLE "organizations" ADD COLUMN     "ban_reason" TEXT,
ADD COLUMN     "dark_favicon" TEXT,
ADD COLUMN     "dark_logo_image" TEXT,
ADD COLUMN     "dark_small_logo_image" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "favicon" TEXT,
ADD COLUMN     "logo_image" TEXT,
ADD COLUMN     "org_type" TEXT,
ADD COLUMN     "small_logo_image" TEXT,
ADD COLUMN     "slug" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN     "stripe_id" TEXT,
ADD COLUMN     "trial_ends_at" TIMESTAMP(3);

-- AlterTable: User - add username and mobile number
ALTER TABLE "users" ADD COLUMN     "mobile_number" TEXT,
ADD COLUMN     "username" TEXT;

-- AlterTable: Contact - add assignment, notes, and WA identity fields
ALTER TABLE "contacts" ADD COLUMN     "assigned_user_id" TEXT,
ADD COLUMN     "country_code" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "phone_verified_at" TIMESTAMP(3),
ADD COLUMN     "username" TEXT,
ADD COLUMN     "wa_id" TEXT;

-- AlterTable: OrganizationMember - add permissions
ALTER TABLE "organization_members" ADD COLUMN     "permissions" JSONB NOT NULL DEFAULT '{}';

-- AlterTable: Chatbot - add start trigger
ALTER TABLE "chatbots" ADD COLUMN     "start_trigger" TEXT;

-- CreateTable: vendor_settings
CREATE TABLE "vendor_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "data_type" TEXT NOT NULL DEFAULT 'string',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: canned_responses
CREATE TABLE "canned_responses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortcut" TEXT,
    "content" TEXT NOT NULL,
    "media_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_settings_organization_id_key_key" ON "vendor_settings"("organization_id", "key");

-- CreateIndex
CREATE INDEX "vendor_settings_organization_id_idx" ON "vendor_settings"("organization_id");

-- CreateIndex
CREATE INDEX "canned_responses_organization_id_idx" ON "canned_responses"("organization_id");

-- AddForeignKey
ALTER TABLE "vendor_settings" ADD CONSTRAINT "vendor_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canned_responses" ADD CONSTRAINT "canned_responses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
