-- Structured presentation data (template header/footer/buttons/carousel, interactive replies)
-- separated from `body`, which stays plain human-readable text for AI/search/flow-trigger consumers.
ALTER TABLE "messages" ADD COLUMN "rich_content" JSONB;
