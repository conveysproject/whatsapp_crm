# Sprint 18 — Trust Score & ML Microservice

## Sprint Goal
Give sales and support teams a single 0–100 health score per contact that synthesises engagement, deal activity, and lifecycle stage — enabling prioritisation without manual data archaeology.

## What We're Building

- **Python ML microservice** — `services/ml/`: FastAPI 0.111 app running on port 8000. Two routers:
  - `POST /trust-score` — accepts `ContactFeatures` JSON, returns `{ score: int, breakdown: {...} }`.
  - `POST /predict/churn` — returns `{ probability: float, label: "high" | "medium" | "low" }`.
  - `POST /predict/ltv` — returns `{ estimatedLtv: float, confidence: float }`.
- **Trust Score model** — `services/ml/models/trust_score.py`: heuristic `TrustScoreModel` (no training data required at Sprint 18 scale). Score = weighted sum:
  - `lifecycle_stage` weight (25 pts): `customer=25`, `opportunity=20`, `lead=10`, `prospect=5`, `churned=0`
  - `engagement_ratio` (25 pts): `(inbound_messages / total_messages) * 25` capped at 25
  - `recency_score` (25 pts): days since last message — `<7d=25`, `<30d=15`, `<90d=5`, `>=90d=0`
  - `deal_activity` (25 pts): has open deal with value `>0`? 25 pts else 0
  - Returns int 0–100.
- **Churn + LTV predictors** — `services/ml/models/predictions.py`: also heuristic in Sprint 18. Churn: `lifecycle_stage == "churned"` or `recency_score == 0` → high. LTV: deal value sum for contact. Full ML training (scikit-learn `GradientBoostingClassifier`) is Sprint 23+ once enough labelled data exists.
- **Trust Score Node.js route** — `apps/api/src/routes/trust-score.ts`: `GET /v1/contacts/:id/trust-score`. Fetches contact, messages, deals from Postgres, assembles `ContactFeatures`, calls `http://ml-service:8000/trust-score` via `fetch`, returns the score.
- **Docker Compose ML service** — `services/ml/Dockerfile` (Python 3.11-slim + requirements.txt), added as `ml-service` in `docker-compose.yml`. The Node API container reaches it at `http://ml-service:8000`.
- **Trust Score badge** — `apps/web/components/contacts/TrustScoreBadge.tsx`: colored circle badge (green ≥70, yellow 40–69, red <40) rendered on the ContactDetail page and contact list rows.

## Key Technical Decisions

- **Python FastAPI microservice, not a Node.js port** — The ML ecosystem (scikit-learn, pandas, numpy) is Python-native. Sprint 18 uses heuristics, but Sprint 23 will train real models. Starting in Python avoids a rewrite later.
- **Heuristic model in Sprint 18, trained model in Sprint 23** — Need 6+ months of labelled outcomes (churn events, actual LTV) before ML training is meaningful. The heuristic gives a useful score immediately and establishes the API contract that Sprint 23 will fulfill behind the same endpoint.
- **Proxy through Node API, not direct browser calls** — The web app calls `GET /v1/contacts/:id/trust-score` on the Node API. The Node API calls the ML service internally. This keeps the ML service off the public internet (no auth, no CORS needed on port 8000) and allows the Node API to enrich the response with cached data.
- **`ContactFeatures` as the microservice contract** — The Python `/trust-score` endpoint accepts only pre-computed features (counts, ratios, stage). It does not query Postgres directly — the Node API handles all DB access. Clean separation: Node = data, Python = computation.
- **`ML_SERVICE_URL` env var** — Defaults to `http://ml-service:8000` in Docker Compose. Overridable to a real endpoint in staging/production (ECS service discovery or ALB internal target group).

## Dependencies

- **External:** Docker installed locally (for `ml-service` container); `ML_SERVICE_URL` env var in staging
- **Internal:** Sprints 1–17 complete; contacts, messages, deals models exist

## Definition of Done

- [ ] `docker compose up -d ml-service` starts the Python FastAPI container
- [ ] `POST http://localhost:8000/trust-score` returns `{ score: int, breakdown: {...} }`
- [ ] `GET /v1/contacts/:id/trust-score` returns trust score from Node API (calls ML service internally)
- [ ] TrustScoreBadge renders on ContactDetail page with correct color tier
- [ ] `POST http://localhost:8000/predict/churn` and `POST /predict/ltv` return valid responses
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `trust-score.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ML service down → Node API 500 | Medium | Medium | Node API wraps ML call in try/catch; returns `{ score: null, error: "ml_service_unavailable" }` with 200 status |
| Heuristic score feels arbitrary to users | Medium | Low | Score breakdown (`{ lifecycle: 20, engagement: 15, recency: 25, dealActivity: 25 }`) displayed in tooltip so users can understand each component |
| Python container not running locally (dev forgot `docker compose up`) | High | Low | `GET /v1/contacts/:id/trust-score` logs warning and returns `{ score: null }` rather than crashing |
| ML service cold start on ECS | Low | Medium | ECS task with `minCount=1`; no scale-to-zero in Sprint 18 |
