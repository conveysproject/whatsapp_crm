-- One row per (organization, UTC month, alert kind) when a usage threshold is first reached.
-- kind: free_50 | free_80 | free_95 | free_100 (share of the free allowance) | band_1 .. band_n | above (entered a higher band).
-- The unique key makes evaluation idempotent. emailed_at is set only when usage-alert emails are switched on by the owner.
-- Additive only. No foreign keys (history must survive organization deletion).
CREATE TABLE "billing_alert_events" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "messages" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailed_at" TIMESTAMP(3),
    CONSTRAINT "billing_alert_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_alert_events_org_month_kind_key" ON "billing_alert_events"("organization_id", "month", "kind");
CREATE INDEX "billing_alert_events_month_idx" ON "billing_alert_events"("month");
