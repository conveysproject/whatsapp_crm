-- Meta's own billing signal per message (status webhook `pricing` object). Additive only; nullable, no default, no index.
-- NULL means Meta has not (or never) told us. Billing metering counts a message only when meta_pricing_type = 'regular'.
ALTER TABLE "messages" ADD COLUMN "meta_pricing_type" TEXT;
ALTER TABLE "messages" ADD COLUMN "meta_category" TEXT;
