# Sprint 24 — GA Launch & Billing

## Sprint Goal
Ship WBMSG to general availability: add Stripe subscription billing with usage enforcement, load-test the platform to verify SLOs, and complete the self-serve GA launch checklist.

## What We're Building

- **Stripe client** — `apps/api/src/lib/stripe.ts`: `createCheckoutSession(orgId, plan, successUrl, cancelUrl)` → Stripe Checkout URL. `getSubscription(stripeCustomerId)` → `{ plan, status, currentPeriodEnd }`. `handleWebhook(payload, sig)` → validates signature and returns `Stripe.Event`. Price IDs for three plans (`starter`, `growth`, `enterprise`) configured via env vars.
- **Billing API routes** — `apps/api/src/routes/billing.ts`: `POST /v1/billing/checkout` (creates Stripe Checkout session, returns redirect URL), `GET /v1/billing/subscription` (returns current plan + status), `POST /v1/billing/webhook` (Stripe webhook, persists `stripeCustomerId` after checkout completion).
- **Usage limit middleware** — `apps/api/src/middleware/usage-limit.ts`: Fastify `preHandler` hook. Reads `organization.plan` to determine monthly outbound message limit. Counts outbound messages since start of current calendar month. Returns 402 with `usage_limit_exceeded` error if limit hit. Applied to `POST /v1/conversations/:id/messages`.
- **Organization schema additions** — `plan: String @default("free")` and `stripeCustomerId: String?` added to `Organization` Prisma model.
- **Billing settings page** — `apps/web/app/(dashboard)/settings/billing/page.tsx`: plan comparison cards (Starter/Growth/Enterprise), current plan badge, usage meter (messages used / limit this month), Upgrade button triggers Stripe Checkout. Plan limits shown inline so users can self-serve upgrade decisions.
- **Load tests** — `load-tests/smoke.js` (10 VUs × 30 s, p95 <500 ms) and `load-tests/soak.js` (50 VUs × 10 min, p95 <800 ms). Both test `/health`, `GET /v1/contacts`, `GET /v1/conversations`, `GET /v1/analytics/overview`.

## Key Technical Decisions

- **Stripe Checkout hosted page, not Elements** — Stripe Checkout handles PCI compliance, card form, 3D Secure, and international payment methods out of the box. Custom Elements (embedded card form) requires PCI SAQ-A compliance effort — deferred to Sprint 26 if needed.
- **Webhook persists `stripeCustomerId` on `checkout.session.completed`** — The Stripe customer ID is the link between WBMSG's org and Stripe's billing records. It's set exactly once (on first checkout), then used to look up subscription status. No subscription ID stored — always fetched live from Stripe.
- **Usage counted in Postgres, not Stripe** — Stripe metered billing is complex and adds latency. Counting `messages WHERE direction='outbound' AND createdAt >= startOfMonth` in Postgres is fast (indexed) and accurate. The 402 check runs before the message is sent — no retroactive enforcement.
- **Plan limits: Free=500, Starter=5000, Growth=25000, Enterprise=∞** — Sized to match Indian SMB WhatsApp usage patterns: a 5-agent team handles ~100 conversations/day, each with ~10 messages = ~1000 messages/day on Starter. Growth covers orgs using campaigns heavily.
- **k6 load tests as a gate, not CI** — Load tests run manually before GA and after major releases. Running them in CI would require a separate staging environment with realistic data — Sprint 26 infrastructure improvement.

## Dependencies

- **External:** Stripe account with products/prices configured; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID` env vars; k6 installed locally
- **Internal:** All Sprints 1–23 complete; billing page in web settings; `Organization` model exists

## Definition of Done

- [ ] `POST /v1/billing/checkout` → Stripe Checkout session URL returned; visiting URL shows Stripe checkout page
- [ ] Complete Stripe checkout (test mode card 4242 4242 4242 4242) → `organization.stripeCustomerId` set → `GET /v1/billing/subscription` returns `{ plan: "starter", status: "active" }`
- [ ] Outbound message count reaches plan limit → next `POST /v1/conversations/:id/messages` returns 402
- [ ] `/settings/billing` page shows current plan + usage meter + Upgrade button
- [ ] k6 smoke test passes: p95 <500 ms at 10 VUs, 0% error rate
- [ ] k6 soak test passes: p95 <800 ms at 50 VUs sustained 6 minutes, <2% error rate
- [ ] `pnpm --filter @WBMSG/api test` — all pass including `billing.test.ts`
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors
- [ ] GA Launch Checklist verified (see plan.md)

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stripe webhook signature verification fails (raw body not accessible) | Medium | High | Register Fastify route with `config: { rawBody: true }`; use `@fastify/rawbody` plugin |
| Usage limit blocks legitimate agents near month-end | Medium | Medium | 402 response includes `limit`, `used`, and upgrade URL so agents can self-serve immediately |
| k6 soak test reveals DB connection pool exhaustion at 50 VUs | Medium | High | `DATABASE_URL` pool size set to 20 (`?connection_limit=20`); pgBouncer added to ECS if needed |
| GA launch day traffic spike beyond soak test baseline | Low | High | ECS auto-scaling configured: scale out at 70% CPU; tested via `aws ecs update-service --desired-count 3` |
