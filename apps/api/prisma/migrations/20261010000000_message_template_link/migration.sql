-- Link outbound template messages to their template and record where they came from. Additive only, no foreign keys
-- (templates can be deleted; analytics history must survive).
ALTER TABLE "messages" ADD COLUMN "template_id" TEXT;
ALTER TABLE "messages" ADD COLUMN "source" TEXT;
CREATE INDEX "messages_org_template_sent_idx" ON "messages"("organization_id", "template_id", "sent_at");
