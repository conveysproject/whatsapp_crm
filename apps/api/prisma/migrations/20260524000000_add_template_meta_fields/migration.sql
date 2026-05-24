-- Add extracted/Meta fields to templates table
ALTER TABLE "templates"
  ADD COLUMN IF NOT EXISTS "header_format"              TEXT,
  ADD COLUMN IF NOT EXISTS "header_text"                TEXT,
  ADD COLUMN IF NOT EXISTS "body_text"                  TEXT,
  ADD COLUMN IF NOT EXISTS "footer_text"                TEXT,
  ADD COLUMN IF NOT EXISTS "button_count"               INTEGER,
  ADD COLUMN IF NOT EXISTS "quality_score"              TEXT,
  ADD COLUMN IF NOT EXISTS "quality_date"               TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "quality_reasons"            JSONB,
  ADD COLUMN IF NOT EXISTS "rejected_reason"            TEXT,
  ADD COLUMN IF NOT EXISTS "correct_category"           TEXT,
  ADD COLUMN IF NOT EXISTS "parameter_format"           TEXT,
  ADD COLUMN IF NOT EXISTS "message_send_ttl_seconds"   INTEGER,
  ADD COLUMN IF NOT EXISTS "cta_url_tracking_opted_out" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "library_template_name"      TEXT,
  ADD COLUMN IF NOT EXISTS "last_edited_time"           TIMESTAMP(3);
