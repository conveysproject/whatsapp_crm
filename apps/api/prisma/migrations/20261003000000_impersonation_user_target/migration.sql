-- User-level impersonation: record which user was impersonated, the access
-- mode of the session ("readonly" | "edit") and the reason given on elevation.
-- Rollback: ALTER TABLE "impersonation_logs" DROP COLUMN "target_user_id", DROP COLUMN "mode", DROP COLUMN "elevation_reason";
ALTER TABLE "impersonation_logs"
  ADD COLUMN "target_user_id" TEXT,
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'readonly',
  ADD COLUMN "elevation_reason" TEXT;

CREATE INDEX "impersonation_logs_target_user_id_idx" ON "impersonation_logs"("target_user_id");
