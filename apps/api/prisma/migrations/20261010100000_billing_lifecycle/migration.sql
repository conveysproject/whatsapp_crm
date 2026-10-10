-- Billing lifecycle (Phase 1A). Additive only; safe to deploy with BILLING_V2_ENABLED off.
ALTER TABLE "organizations"
  ADD COLUMN "billing_status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "billing_grace_ends_at" TIMESTAMP(3),
  ADD COLUMN "plan_cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "organizations_stripe_id_idx" ON "organizations"("stripe_id");
CREATE INDEX "organizations_billing_status_billing_grace_ends_at_idx"
  ON "organizations"("billing_status", "billing_grace_ends_at");

ALTER TYPE "PaymentGateway" ADD VALUE IF NOT EXISTS 'paystack';
ALTER TYPE "PaymentGateway" ADD VALUE IF NOT EXISTS 'yoomoney';
