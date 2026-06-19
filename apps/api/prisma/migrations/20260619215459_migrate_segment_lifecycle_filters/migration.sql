-- Rewrite segment filter rules: field 'lifecycleStage' (enum value) -> 'leadStatusId' (status id)
-- Uses a scalar subquery (LIMIT 1) so each array element maps to exactly one status id (no fan-out).
UPDATE "segments" s
SET "filters" = sub.new_filters
FROM (
  SELECT s2."id" AS sid,
    jsonb_agg(
      CASE
        WHEN elem->>'field' = 'lifecycleStage'
             AND (
               SELECT ls."id" FROM "lead_statuses" ls
               WHERE ls."organization_id" = s2."organization_id"
                 AND ls."name" = CASE elem->>'value'
                   WHEN 'lead'     THEN 'New Lead'
                   WHEN 'prospect' THEN 'Qualification'
                   WHEN 'customer' THEN 'Closed Won'
                   WHEN 'loyal'    THEN 'Closed Won'
                   WHEN 'churned'  THEN 'Closed Lost'
                 END
               LIMIT 1
             ) IS NOT NULL
          THEN jsonb_set(
                 jsonb_set(elem, '{field}', '"leadStatusId"'),
                 '{value}',
                 to_jsonb((
                   SELECT ls."id" FROM "lead_statuses" ls
                   WHERE ls."organization_id" = s2."organization_id"
                     AND ls."name" = CASE elem->>'value'
                       WHEN 'lead'     THEN 'New Lead'
                       WHEN 'prospect' THEN 'Qualification'
                       WHEN 'customer' THEN 'Closed Won'
                       WHEN 'loyal'    THEN 'Closed Won'
                       WHEN 'churned'  THEN 'Closed Lost'
                     END
                   LIMIT 1
                 ))
               )
        ELSE elem
      END
      ORDER BY ord
    ) AS new_filters
  FROM "segments" s2
  CROSS JOIN LATERAL jsonb_array_elements(s2."filters") WITH ORDINALITY AS arr(elem, ord)
  WHERE jsonb_typeof(s2."filters") = 'array' AND jsonb_array_length(s2."filters") > 0
  GROUP BY s2."id"
) sub
WHERE s."id" = sub.sid;
