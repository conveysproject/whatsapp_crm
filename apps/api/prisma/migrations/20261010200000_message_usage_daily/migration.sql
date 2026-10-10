-- Billing metering (Phase 2A). Additive only; no foreign keys.
CREATE TABLE "message_usage_daily" (
    "organization_id" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "billable_count" INTEGER NOT NULL,
    "by_source" JSONB NOT NULL DEFAULT '{}',
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_usage_daily_pkey" PRIMARY KEY ("organization_id", "day")
);
CREATE INDEX "message_usage_daily_day_idx" ON "message_usage_daily"("day");
