-- Additive only. Own auth tables; Clerk still active.
-- No foreign key from users yet (added in a later phase after the import).

CREATE TABLE "auth_accounts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "password_hash" TEXT,
    "phone_e164" TEXT,
    "phone_verified_at" TIMESTAMP(3),
    "first_name" TEXT,
    "last_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "must_set_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_accounts_email_key" ON "auth_accounts"("email");
CREATE UNIQUE INDEX "auth_accounts_phone_e164_key" ON "auth_accounts"("phone_e164");

CREATE TABLE "auth_oauth_links" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_sub" TEXT NOT NULL,
    "email_at_link" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    CONSTRAINT "auth_oauth_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_oauth_links_provider_provider_sub_key" ON "auth_oauth_links"("provider", "provider_sub");
CREATE UNIQUE INDEX "auth_oauth_links_account_id_provider_key" ON "auth_oauth_links"("account_id", "provider");

CREATE TABLE "auth_sessions" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "previous_token_hash" TEXT,
    "rotated_at" TIMESTAMP(3),
    "family_id" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "device_label" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");
CREATE UNIQUE INDEX "auth_sessions_previous_token_hash_key" ON "auth_sessions"("previous_token_hash");
CREATE INDEX "auth_sessions_account_id_idx" ON "auth_sessions"("account_id");
CREATE INDEX "auth_sessions_family_id_idx" ON "auth_sessions"("family_id");

CREATE TABLE "auth_codes" (
    "id" TEXT NOT NULL,
    "account_id" TEXT,
    "purpose" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auth_codes_purpose_target_created_at_idx" ON "auth_codes"("purpose", "target", "created_at");

CREATE TABLE "auth_trusted_devices" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "device_id_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "auth_trusted_devices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "auth_trusted_devices_account_id_idx" ON "auth_trusted_devices"("account_id");

ALTER TABLE "auth_oauth_links" ADD CONSTRAINT "auth_oauth_links_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_codes" ADD CONSTRAINT "auth_codes_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_trusted_devices" ADD CONSTRAINT "auth_trusted_devices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "login_logs" ADD COLUMN "method" TEXT;
