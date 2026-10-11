-- One statement per organization per UTC month, prepared from message_usage_daily. Created as 'draft' only.
-- Nothing in this table charges anyone: 'issued' (shown to the customer) is set by a later, owner-approved step.
-- amount_* are NULL for a custom-quote volume. Additive only; no foreign keys (history survives organization deletion).
CREATE TABLE "billing_statements" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "organization_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "messages" INTEGER NOT NULL,
    "band_name" TEXT NOT NULL,
    "amount_inr" INTEGER,
    "amount_usd" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issued_at" TIMESTAMP(3),
    CONSTRAINT "billing_statements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_statements_org_month_key" ON "billing_statements"("organization_id", "month");
CREATE INDEX "billing_statements_month_idx" ON "billing_statements"("month");
