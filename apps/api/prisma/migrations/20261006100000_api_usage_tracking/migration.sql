-- API usage tracking: raw per-request log (short retention) and per-day rollup (metering source of truth).
-- Additive only. No foreign keys: credentials are soft-revoked and usage history must survive.

CREATE TABLE "api_request_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT,
    "api_key_id" TEXT,
    "method" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "error_class" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "api_request_logs_organization_id_created_at_idx" ON "api_request_logs"("organization_id", "created_at");
CREATE INDEX "api_request_logs_api_key_id_created_at_idx" ON "api_request_logs"("api_key_id", "created_at");
CREATE INDEX "api_request_logs_created_at_idx" ON "api_request_logs"("created_at");

CREATE TABLE "api_usage_daily" (
    "organization_id" TEXT NOT NULL,
    "api_key_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "success" INTEGER NOT NULL DEFAULT 0,
    "client_errors" INTEGER NOT NULL DEFAULT 0,
    "server_errors" INTEGER NOT NULL DEFAULT 0,
    "rate_limited" INTEGER NOT NULL DEFAULT 0,
    "auth_failures" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "duration_ms_sum" BIGINT NOT NULL DEFAULT 0,
    "duration_ms_max" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_daily_pkey" PRIMARY KEY ("organization_id", "api_key_id", "day", "endpoint")
);

CREATE INDEX "api_usage_daily_organization_id_day_idx" ON "api_usage_daily"("organization_id", "day");
