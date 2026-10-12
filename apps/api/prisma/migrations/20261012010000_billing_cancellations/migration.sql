-- One cancellation record per organization. status: requested (customer asked, owner has not approved yet),
-- approved (owner approved: sending is off, final statement issued, account kept 30 days), withdrawn (dismissed, withdrawn or reactivated).
-- Additive only. No foreign key (history survives organization deletion).
CREATE TABLE "billing_cancellations" (
    "organization_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requested_by" TEXT,
    "reason" TEXT,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_cancellations_pkey" PRIMARY KEY ("organization_id")
);
CREATE INDEX "billing_cancellations_status_idx" ON "billing_cancellations"("status");
