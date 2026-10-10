-- Supports per-organization, per-day counting for billing metering. If messages is large,
-- create it out of band instead: CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_org_sent_at_idx" ON "messages"("organization_id", "sent_at");
CREATE INDEX IF NOT EXISTS "messages_org_sent_at_idx" ON "messages"("organization_id", "sent_at");
