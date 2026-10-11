-- Payment-link fields on billing_statements. A statement is payable only after the owner issues it; the link, amount and
-- currency are fixed at that moment (amount_minor is in minor units: paise or cents). Additive only, all nullable or defaulted.
ALTER TABLE "billing_statements" ADD COLUMN "currency" TEXT;
ALTER TABLE "billing_statements" ADD COLUMN "amount_minor" INTEGER;
ALTER TABLE "billing_statements" ADD COLUMN "due_at" TIMESTAMP(3);
ALTER TABLE "billing_statements" ADD COLUMN "payment_url" TEXT;
ALTER TABLE "billing_statements" ADD COLUMN "payment_provider" TEXT;
ALTER TABLE "billing_statements" ADD COLUMN "payment_ref" TEXT;
ALTER TABLE "billing_statements" ADD COLUMN "paid_at" TIMESTAMP(3);
ALTER TABLE "billing_statements" ADD COLUMN "reminders_sent" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "billing_statements_status_idx" ON "billing_statements"("status");
