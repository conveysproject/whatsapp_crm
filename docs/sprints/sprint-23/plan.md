# Sprint 23 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-5.md`
> Task 8 covers Sprint 23.

## Pre-conditions
- Sprints 1–22 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- Python ML microservice running (`docker compose up -d ml-service`)
- At least 6 months of historical contact + deal data available for training export

## Task Summary

| # | Task | Key files |
|---|---|---|
| 8 | Training scripts + updated predictions.py + pytest suite | `services/ml/training/train_churn.py`, `services/ml/training/train_ltv.py`, `services/ml/models/predictions.py`, `services/ml/tests/conftest.py`, `services/ml/tests/test_trust_score.py`, `services/ml/tests/test_predictions.py` |

## Test Checklist

- [ ] `pytest services/ml/tests/ -v` — all tests pass without artifacts (heuristic fallback)
- [ ] `pytest services/ml/tests/ -v` — all tests pass with artifacts present (trained model path)
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: Export historical CSV from Postgres (see data export query below)
- [ ] Manual: `python -m training.train_churn --data contacts_history.csv` → prints classification report → `artifacts/churn_model.joblib` created
- [ ] Manual: `python -m training.train_ltv --data deals_history.csv` → prints MAE → `artifacts/ltv_model.joblib` created
- [ ] Manual: `docker compose restart ml-service` → `POST /predict/churn` uses trained model

## Deployment / Environment Notes

No new env vars required.

Export training data from Postgres (adjust table/column names to match current schema):
```sql
-- Churn training data
COPY (
  SELECT
    c.lifecycle_stage,
    COUNT(m.id) FILTER (WHERE m.direction = 'inbound')::float / NULLIF(COUNT(m.id), 0) AS engagement_ratio,
    EXTRACT(DAY FROM NOW() - MAX(m.created_at)) AS days_since_last_message,
    EXISTS(SELECT 1 FROM deals d WHERE d.contact_id = c.id AND d.stage != 'lost') AS has_open_deal,
    COALESCE(SUM(d.value), 0) AS deal_value,
    (c.lifecycle_stage = 'churned')::int AS churned
  FROM contacts c
  LEFT JOIN messages m ON m.conversation_id IN (
    SELECT id FROM conversations WHERE contact_id = c.id
  )
  LEFT JOIN deals d ON d.contact_id = c.id
  GROUP BY c.id
) TO '/tmp/contacts_history.csv' CSV HEADER;
```

Upload model artifacts to S3 after training:
```bash
aws s3 cp services/ml/artifacts/churn_model.joblib s3://<bucket>/ml-artifacts/churn_model.joblib
aws s3 cp services/ml/artifacts/ltv_model.joblib s3://<bucket>/ml-artifacts/ltv_model.joblib
```

ECS task startup script (in Dockerfile `CMD`) should download artifacts from S3 before starting FastAPI if available.
