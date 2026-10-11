-- Permanent record of each message Meta reported as chargeable (status webhook pricing.type = 'regular').
-- Deliberately has NO foreign key to messages: deleting messages (retention job, history delete) must never lower a count.
-- Additive only. One row per message (message_id is the primary key, so repeated webhooks are idempotent).
CREATE TABLE "billable_message_events" (
    "message_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "category" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billable_message_events_pkey" PRIMARY KEY ("message_id")
);
CREATE INDEX "billable_message_events_org_sent_idx" ON "billable_message_events"("organization_id", "sent_at");
CREATE INDEX "billable_message_events_sent_idx" ON "billable_message_events"("sent_at");
