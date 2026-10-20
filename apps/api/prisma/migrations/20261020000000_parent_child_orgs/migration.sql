-- Parent/child organizations. Additive only.
-- No unique index on organizations.phone_number_id here: run scripts/check-duplicate-phone-number-ids.mjs on prod first.
-- Ids are TEXT (Prisma String uuid), matching organizations.id.

ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "parent_organization_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "is_parent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_organization_id_fkey" FOREIGN KEY ("parent_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_not_self_check" CHECK ("parent_organization_id" IS NULL OR "parent_organization_id" <> "id");
CREATE INDEX IF NOT EXISTS "organizations_parent_organization_id_idx" ON "organizations"("parent_organization_id");

CREATE TABLE IF NOT EXISTS "client_invitations" (
    "id" TEXT NOT NULL,
    "parent_organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "accepted_org_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "client_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "client_invitations_token_key" ON "client_invitations"("token");
CREATE INDEX IF NOT EXISTS "client_invitations_parent_organization_id_idx" ON "client_invitations"("parent_organization_id");

CREATE TABLE IF NOT EXISTS "parent_audit_events" (
    "id" TEXT NOT NULL,
    "parent_organization_id" TEXT NOT NULL,
    "child_organization_id" TEXT,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parent_audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "parent_audit_events_parent_organization_id_idx" ON "parent_audit_events"("parent_organization_id");
CREATE INDEX IF NOT EXISTS "parent_audit_events_child_organization_id_idx" ON "parent_audit_events"("child_organization_id");
CREATE INDEX IF NOT EXISTS "parent_audit_events_created_at_idx" ON "parent_audit_events"("created_at");

ALTER TABLE "impersonation_logs" ADD COLUMN IF NOT EXISTS "actor_organization_id" TEXT;
ALTER TABLE "api_message_meta" ADD COLUMN IF NOT EXISTS "parent_organization_id" TEXT;
