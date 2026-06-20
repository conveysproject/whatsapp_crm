-- Backfill leadStatusId for any contact still missing it (created between 2a and 2b-1)
UPDATE "contacts" c
SET "lead_status_id" = ls."id"
FROM "lead_statuses" ls
WHERE c."lead_status_id" IS NULL
  AND ls."organization_id" = c."organization_id"
  AND ls."name" = CASE c."lifecycle_stage"::text
    WHEN 'lead'     THEN 'New Lead'
    WHEN 'prospect' THEN 'Qualification'
    WHEN 'customer' THEN 'Closed Won'
    WHEN 'loyal'    THEN 'Closed Won'
    WHEN 'churned'  THEN 'Closed Lost'
  END;
