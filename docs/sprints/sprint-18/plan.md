# Sprint 18 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-4.md`
> Task 10 covers Sprint 18.

## Pre-conditions
- Sprints 1–17 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- Docker running locally (`docker compose up -d`)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 10 | Python ML microservice + Trust Score route + TrustScoreBadge UI | `services/ml/main.py`, `services/ml/models/trust_score.py`, `services/ml/models/predictions.py`, `services/ml/requirements.txt`, `services/ml/Dockerfile`, `docker-compose.yml`, `apps/api/src/routes/trust-score.ts`, `apps/api/src/routes/trust-score.test.ts`, `apps/web/components/contacts/TrustScoreBadge.tsx` |

## Test Checklist

- [ ] `pnpm --filter @trustcrm/api test` — all pass including `trust-score.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] Manual: `docker compose up -d ml-service` → container healthy
- [ ] Manual: `curl -X POST http://localhost:8000/trust-score -H "Content-Type: application/json" -d '{"lifecycleStage":"customer","inboundMessages":40,"totalMessages":50,"daysSinceLastMessage":3,"hasOpenDeal":true,"dealValue":50000}'` → `{ "score": 95, "breakdown": {...} }`
- [ ] Manual: `GET /v1/contacts/:id/trust-score` → JSON with score and breakdown
- [ ] Manual: ContactDetail page shows TrustScoreBadge (green for score ≥70)
- [ ] Manual: Kill `ml-service` container → `GET /v1/contacts/:id/trust-score` returns `{ "score": null }` (no 500)

## Deployment / Environment Notes

Add to `.env` and staging/production secrets:
```
ML_SERVICE_URL=http://ml-service:8000
```

In production (ECS), set `ML_SERVICE_URL` to the internal ALB or service-discovery DNS for the ML ECS task.

No new Postgres migrations required (Trust Score is computed on-the-fly, not persisted in Sprint 18).

Build ML Docker image locally to verify:
```bash
docker compose build ml-service
docker compose up -d ml-service
```
