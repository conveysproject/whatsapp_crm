-- Per-organization outbound email provider settings. Additive only.
-- config_enc holds the provider credentials encrypted with EMAIL_SETTINGS_KEY (AES-256-GCM).
CREATE TABLE IF NOT EXISTS "org_email_settings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "from_name" TEXT,
    "reply_to" TEXT,
    "config_enc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "last_tested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_email_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "org_email_settings_status_check" CHECK ("status" IN ('unverified', 'verified', 'failing')),
    CONSTRAINT "org_email_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_email_settings_organization_id_key" ON "org_email_settings"("organization_id");
