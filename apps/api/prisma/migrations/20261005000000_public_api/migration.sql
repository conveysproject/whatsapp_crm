-- Public (Plivo-compatible) API: extend api_keys, add per-message API metadata.
ALTER TABLE "api_keys"
  ADD COLUMN "revoked_at"   TIMESTAMP(3),
  ADD COLUMN "created_by"   TEXT,
  ADD COLUMN "token_enc"    TEXT,
  ADD COLUMN "callback_url" TEXT,
  ADD COLUMN "inbound_url"  TEXT;

CREATE TABLE "api_message_meta" (
  "message_id"         TEXT NOT NULL,
  "api_key_id"         TEXT NOT NULL,
  "organization_id"    TEXT NOT NULL,
  "dst"                TEXT NOT NULL,
  "callback_url"       TEXT,
  "callback_method"    TEXT NOT NULL DEFAULT 'POST',
  "error_code"         TEXT,
  "last_status"        TEXT,
  "sequence"           INTEGER NOT NULL DEFAULT 0,
  "queued_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sent_at"            TIMESTAMP(3),
  "delivery_report_at" TIMESTAMP(3),
  CONSTRAINT "api_message_meta_pkey" PRIMARY KEY ("message_id")
);

CREATE INDEX "api_message_meta_organization_id_queued_at_idx" ON "api_message_meta"("organization_id", "queued_at");
CREATE INDEX "api_message_meta_api_key_id_idx" ON "api_message_meta"("api_key_id");

ALTER TABLE "api_message_meta"
  ADD CONSTRAINT "api_message_meta_message_id_fkey"
  FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
