# Sprint 24 — Implementation Plan

> Full task details are in the batch plan: `docs/superpowers/plans/2026-04-28-sprint-planning-batch-5.md`
> Tasks 9–11 cover Sprint 24.

## Pre-conditions
- Sprints 1–23 complete and merged
- All test suites green: `pnpm test`, `pnpm type-check`, `pnpm lint`
- Stripe account created; products and prices configured in Stripe Dashboard
- k6 installed locally (`brew install k6` / `choco install k6`)

## Task Summary

| # | Task | Key files |
|---|---|---|
| 9 | Stripe billing (client, routes, tests, usage limit middleware, billing settings page) | `apps/api/src/lib/stripe.ts`, `apps/api/src/routes/billing.ts`, `apps/api/src/routes/billing.test.ts`, `apps/api/src/middleware/usage-limit.ts`, `apps/api/prisma/schema.prisma`, `apps/web/app/(dashboard)/settings/billing/page.tsx` |
| 10 | k6 load tests + Sidebar billing link + final GA polish | `load-tests/smoke.js`, `load-tests/soak.js`, `apps/web/components/layout/Sidebar.tsx` |
| 11 | Final type-check + lint + GA readiness verification | (all packages) |

## Test Checklist

- [ ] `pnpm --filter @WBMSG/api test` — all pass including `billing.test.ts`
- [ ] `pnpm type-check` — no errors across all packages
- [ ] `pnpm lint` — no errors
- [ ] `pytest services/ml/tests/ -v` — all pass
- [ ] Manual: Stripe test checkout (card 4242...) → `stripeCustomerId` set on org
- [ ] Manual: `GET /v1/billing/subscription` → `{ plan: "starter", status: "active" }`
- [ ] Manual: Exceed message limit → `POST /v1/conversations/:id/messages` → 402
- [ ] Manual: `/settings/billing` → plan cards, usage meter, upgrade button visible
- [ ] k6 smoke: `k6 run --env API_URL=http://localhost:4000 --env API_TOKEN=<token> load-tests/smoke.js` → all thresholds pass
- [ ] k6 soak: `k6 run --env API_URL=<staging-url> --env API_TOKEN=<token> load-tests/soak.js` → p95 <800 ms

## Deployment / Environment Notes

Add to `.env` and staging/production secrets:
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_GROWTH_PRICE_ID=price_...
STRIPE_ENTERPRISE_PRICE_ID=price_...
WEB_BASE_URL=https://app.WBMSG.in
```

Install Stripe SDK:
```bash
pnpm --filter @WBMSG/api add stripe
pnpm --filter @WBMSG/web add @stripe/stripe-js
```

Run migration:
```bash
cd apps/api
pnpm exec prisma migrate dev --name add_org_billing
pnpm exec prisma generate
```

Configure Stripe webhook endpoint in Stripe Dashboard:
- URL: `https://api.WBMSG.in/v1/billing/webhook`
- Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

## GA Launch Checklist

- [ ] All 24 sprint Definition of Done items verified
- [ ] Stripe live mode keys configured in production (not test keys)
- [ ] Stripe webhook endpoint verified (Stripe Dashboard shows "Webhook healthy")
- [ ] k6 soak test p95 <800 ms at 50 VUs on production/staging
- [ ] Sentry shows 0 unhandled errors after 24-hour staging soak
- [ ] Datadog dashboard: API p95 <500 ms, error rate <0.5%, BullMQ queue depth <100
- [ ] ECS auto-scaling: `minCount=2`, `maxCount=10`, scale-out at 70% CPU
- [ ] Mobile app (iOS + Android) in public App Store / Play Store
- [ ] Self-serve signup: new user → onboarding wizard → inbox receiving messages end-to-end
- [ ] `GET https://api.WBMSG.in/health` → 200 on production
- [ ] DNS, SSL certificate, and ALB health checks verified
- [ ] PagerDuty on-call rotation active for P1/P2 alerts
- [ ] Runbook reviewed by all engineers and SRE
