-- Add superAdmin role
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'superAdmin';

-- Add deleted_at to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;

-- Admin audit log
CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "actor_id"    TEXT        NOT NULL,
  "action"      TEXT        NOT NULL,
  "target_type" TEXT,
  "target_id"   TEXT,
  "metadata"    JSONB,
  "ip_address"  TEXT,
  "user_agent"  TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "admin_audit_logs_actor_id_idx"   ON "admin_audit_logs"("actor_id");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_target_id_idx"  ON "admin_audit_logs"("target_id");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx"     ON "admin_audit_logs"("action");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_at_idx" ON "admin_audit_logs"("created_at");

-- Impersonation log
CREATE TABLE IF NOT EXISTS "impersonation_logs" (
  "id"              TEXT        NOT NULL PRIMARY KEY,
  "actor_id"        TEXT        NOT NULL,
  "organization_id" TEXT        NOT NULL,
  "org_name"        TEXT,
  "token"           TEXT        NOT NULL UNIQUE,
  "ip_address"      TEXT,
  "user_agent"      TEXT,
  "started_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ended_at"        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS "impersonation_logs_actor_id_idx"        ON "impersonation_logs"("actor_id");
CREATE INDEX IF NOT EXISTS "impersonation_logs_organization_id_idx" ON "impersonation_logs"("organization_id");
CREATE INDEX IF NOT EXISTS "impersonation_logs_started_at_idx"      ON "impersonation_logs"("started_at");
