-- Public API payload logging. Additive only. No foreign keys (credentials are soft-revoked; history must survive).

CREATE TABLE "api_request_payloads" (
    "id" TEXT NOT NULL,                       -- equals the api_id returned to the client
    "organization_id" TEXT NOT NULL,
    "api_key_id" TEXT,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "error_class" TEXT,
    "error_code" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "request_body" TEXT,
    "response_body" TEXT,
    "request_truncated" BOOLEAN NOT NULL DEFAULT false,
    "response_truncated" BOOLEAN NOT NULL DEFAULT false,
    "query_string" TEXT,
    "client_ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_request_payloads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_request_payloads_org_created_idx" ON "api_request_payloads"("organization_id", "created_at");
CREATE INDEX "api_request_payloads_key_created_idx" ON "api_request_payloads"("api_key_id", "created_at");
CREATE INDEX "api_request_payloads_created_idx" ON "api_request_payloads"("created_at");

CREATE TABLE "api_callback_attempts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "message_id" TEXT,
    "url" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "outcome" TEXT NOT NULL,                  -- delivered | http_error | network_error | dropped
    "http_status" INTEGER,
    "reason" TEXT,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_callback_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "api_callback_attempts_org_created_idx" ON "api_callback_attempts"("organization_id", "created_at");
CREATE INDEX "api_callback_attempts_message_idx" ON "api_callback_attempts"("organization_id", "message_id");
CREATE INDEX "api_callback_attempts_created_idx" ON "api_callback_attempts"("created_at");

CREATE TABLE "api_payload_access_audit" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "rows_returned" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_payload_access_audit_pkey" PRIMARY KEY ("id")
);
