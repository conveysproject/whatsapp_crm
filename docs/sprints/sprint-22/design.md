# Sprint 22 — Performance & Scale

## Sprint Goal
Make WBMSG fast at scale — add Redis caching to eliminate redundant DB reads, rate-limit the API to prevent abuse, and support per-org Anthropic API keys for enterprise customers who want cost isolation.

## What We're Building

- **Redis cache helpers** — `apps/api/src/lib/cache.ts`: `ioredis`-backed `cacheGet<T>`, `cacheSet`, and `cacheDel` helpers. All cache failures are silent (caught and logged) — the API falls through to Postgres on a cache miss. TTL default: 300 s (5 minutes).
- **Contact list + analytics caching** — Contacts list (`GET /v1/contacts`) and all three analytics endpoints (`GET /v1/analytics/*`) are wrapped with cache-aside: check cache → return if hit → query Postgres → set cache → return. Cache is invalidated by org-scoped pattern (`contacts:{orgId}:*`) on any write (POST/PATCH/DELETE contacts).
- **Rate limiting** — `apps/api/src/plugins/rate-limit.ts`: `@fastify/rate-limit` plugin backed by Redis. Limit: 100 req/min per org (authenticated) or 100 req/min per IP (unauthenticated). `POST /v1/messages` has a tighter limit: 30 req/min per org (prevents campaign abuse). Returns 429 with retry-after header.
- **Per-org AI key** — `Organization.aiApiKey` (nullable) added to the Prisma schema. `PATCH /v1/organizations` allows admins to set their own Anthropic API key. `apps/api/src/lib/claude.ts` reads the org's key first; falls back to `ANTHROPIC_API_KEY` env var. Key stored in plaintext in dev; encrypted via KMS in production (documented in runbook, not implemented in code here).

## Key Technical Decisions

- **`ioredis` over `redis` npm package** — `ioredis` has better TypeScript types, built-in cluster support, and is more actively maintained. At Redis 7 on ElastiCache, either works — ioredis is the de-facto standard in Node.js.
- **Cache-aside (lazy loading), not write-through** — Write-through would require updating the cache on every mutation. Cache-aside is simpler: only popular reads get cached; cold data fetches from Postgres and warms the cache naturally.
- **Org-scoped cache keys** — All cache keys include `organizationId` (`contacts:{orgId}:list`). This ensures cross-org data isolation and allows targeted invalidation without flushing the whole Redis keyspace.
- **Rate limit backed by Redis, not in-memory** — In-memory rate limits reset on server restart and don't work across multiple API instances (ECS tasks). Redis persists counters across restarts and is shared across all API instances.
- **`aiApiKey` null means "use env var"** — Orgs on the free/starter plan share the platform Anthropic API key (costs borne by WBMSG). Enterprise orgs can bring their own key for cost isolation and higher rate limits.

## Dependencies

- **External:** Redis 7 (already in docker-compose from Sprint 1); `REDIS_URL` env var
- **Internal:** Sprints 1–21 complete; contacts and analytics routes exist; claude.ts exists

## Definition of Done

- [ ] Second `GET /v1/contacts` request (same org) served from Redis cache (measurably faster)
- [ ] `POST /v1/contacts` invalidates the contacts cache (subsequent GET hits Postgres again)
- [ ] 101st request within 1 minute from same org → 429 Too Many Requests
- [ ] `PATCH /v1/organizations` with `aiApiKey` → stored on org; subsequent Claude calls use that key
- [ ] `pnpm --filter @WBMSG/api test` — all pass
- [ ] `pnpm type-check` — no errors
- [ ] `pnpm lint` — no errors

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Redis connection failure crashes the API | Low | High | `ioredis` configured with `enableOfflineQueue: false` and `lazyConnect: true`; errors are caught — cache miss falls through to DB |
| Rate limit too tight for legitimate batch imports | Medium | Medium | CSV import route (`POST /v1/contacts/import`) is exempted from rate limiting (whitelisted in the plugin by URL pattern) |
| Cache stale data causes confusing UX | Low | Low | 5-minute TTL; team lead revieweing analytics at 4:59 min might see slightly stale data — acceptable for non-real-time reporting |
