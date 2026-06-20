-- Rewrite flow update_stage nodes: config.lifecycleStage (enum) -> config.leadStatusId (status id).
-- Scalar subquery (LIMIT 1) for name->id so no fan-out; only transform when the mapped id is non-null; order preserved.
UPDATE "flows" f
SET "flow_definition" = jsonb_set(
  f."flow_definition", '{nodes}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN node->>'type' = 'update_stage'
             AND node->'config' ? 'lifecycleStage'
             AND (SELECT ls."id" FROM "lead_statuses" ls
                  WHERE ls."organization_id" = f."organization_id"
                    AND ls."name" = CASE node->'config'->>'lifecycleStage'
                      WHEN 'lead' THEN 'New Lead' WHEN 'prospect' THEN 'Qualification'
                      WHEN 'customer' THEN 'Closed Won' WHEN 'loyal' THEN 'Closed Won'
                      WHEN 'churned' THEN 'Closed Lost' END
                  LIMIT 1) IS NOT NULL
        THEN jsonb_set(node, '{config}',
               (node->'config') - 'lifecycleStage'
               || jsonb_build_object('leadStatusId',
                    (SELECT ls."id" FROM "lead_statuses" ls
                     WHERE ls."organization_id" = f."organization_id"
                       AND ls."name" = CASE node->'config'->>'lifecycleStage'
                         WHEN 'lead' THEN 'New Lead' WHEN 'prospect' THEN 'Qualification'
                         WHEN 'customer' THEN 'Closed Won' WHEN 'loyal' THEN 'Closed Won'
                         WHEN 'churned' THEN 'Closed Lost' END
                     LIMIT 1)))
        ELSE node
      END ORDER BY ord
    )
    FROM jsonb_array_elements(f."flow_definition"->'nodes') WITH ORDINALITY AS arr(node, ord)
  )
)
WHERE f."flow_definition" ? 'nodes'
  AND jsonb_typeof(f."flow_definition"->'nodes') = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(f."flow_definition"->'nodes') n
    WHERE n->>'type' = 'update_stage' AND n->'config' ? 'lifecycleStage'
  );
