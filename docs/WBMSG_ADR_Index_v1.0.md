# WBMSG
# Architecture Decision Records — Index &amp; Baseline
Michael Nygard ADR Pattern — 8 Baseline Records
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
VP Engineering / Tech Leads
## 1. Purpose
This document indexes every Architecture Decision Record (ADR) for the WBMSG platform and contains the eight baseline ADRs taken at end of Sprint 0. ADRs document architecturally significant decisions: those that shape structure, dependencies, interfaces, or non-functional behaviour.
Format follows Michael Nygard's lightweight pattern: Status / Context / Decision / Consequences. Each ADR is immutable once Accepted; superseding is captured by a new ADR that links back.
## 2. ADR Lifecycle
- Proposed — author drafts; circulated for review.
- Accepted — agreed by Tech Leads; recorded; takes effect.
- Deprecated — no longer recommended but historically active.
- Superseded — replaced by a newer ADR (link required).
- Rejected — considered and not adopted; kept for posterity.
## 3. Index

| ID | Title | Status | Date |
| --- | --- | --- | --- |
| ADR-001 | Choose Next.js 15 App Router for the web app | Accepted | 10-Apr-2026 |
| ADR-002 | Use PostgreSQL via Supabase Managed for the primary datastore | Accepted | 11-Apr-2026 |
| ADR-003 | Adopt Drizzle ORM over Prisma for type-safe DB access | Accepted | 12-Apr-2026 |
| ADR-004 | Multi-tenancy: shared-schema with row-level organization_id | Accepted | 13-Apr-2026 |
| ADR-005 | Use Clerk for identity &amp; SSO; defer to Auth0 only on enterprise demand | Accepted | 14-Apr-2026 |
| ADR-006 | Integration tests run against a real Postgres, never mocks | Accepted | 16-Apr-2026 |
| ADR-007 | Adopt Turborepo + pnpm workspaces; reject Nx for now | Accepted | 18-Apr-2026 |
| ADR-008 | Multi-LLM strategy: OpenAI primary, Anthropic fallback, abstraction layer in-repo | Accepted | 20-Apr-2026 |

————————————————————————————————————————
## ADR-001 — Next.js 15 App Router for the Web App
### Status
Accepted — 10-Apr-2026
### Context
We need a web stack that supports server-side rendering for SEO-light marketing pages, fast first paint for the agent inbox, file-based routing, and an integrated build pipeline. The team has React expertise. Top candidates: Next.js 15 (App Router), Remix, Astro, plain Vite + React Router.
### Decision
Adopt Next.js 15 with the App Router. Hosted on Vercel for the GA period; self-host on Node 22 + Docker available as fallback for Enterprise.
### Consequences
- Positive: file-system routing, RSC by default, integrated middleware (Clerk auth), edge functions for global latency, image optimisation built in.
- Positive: large hiring pool; team already productive.
- Negative: vendor coupling to Vercel for some advanced features (image, ISR semantics) — mitigated by ADR-001b (planned) for self-host.
- Negative: App Router still maturing; some libraries lag (e.g., real-time websocket clients).
- Migration cost: low (Sprint 0 starting fresh).
————————————————————————————————————————
## ADR-002 — PostgreSQL via Supabase Managed
### Status
Accepted — 11-Apr-2026
### Context
We need a primary datastore that supports relational integrity, JSONB for semi-structured customer data, full-text search, row-level security as a defence-in-depth, and managed operations until we have a dedicated DBA. Candidates: Supabase Managed Postgres, RDS Postgres, Aurora, PlanetScale (MySQL), Cockroach.
### Decision
Use Postgres 16 hosted on Supabase Managed in ap-south-1, with a read-replica in ap-south-2 for DR. Migrate to RDS or self-managed Postgres if Supabase pricing or feature ceiling becomes binding (re-evaluation gate at 1M users).
### Consequences
- Positive: single technology that satisfies relational, search, and JSONB needs without bringing a second engine.
- Positive: Supabase manages backups, point-in-time recovery, replication, monitoring — frees the small team.
- Positive: ap-south-1 region matches our DPDP residency posture.
- Negative: vendor concentration risk; mitigated by Postgres being portable (standard PG).
- Negative: hot-shard risk above 10K orgs on a single primary — addressed in road-map (functional partitioning by tenant tier).
————————————————————————————————————————
## ADR-003 — Drizzle ORM over Prisma
### Status
Accepted — 12-Apr-2026
### Context
We need type-safe database access without sacrificing query control. Prisma is the obvious default but its query builder hides SQL, generates joins the team can't easily inspect, and its migration model lacks expressiveness for complex Postgres features (partial indexes, generated columns).
### Decision
Use Drizzle ORM. Schemas defined in TypeScript; migrations use raw SQL files the team can read; query builder produces SQL that maps 1:1 to what's emitted.
### Consequences
- Positive: SQL-first; engineers stay literate in the database.
- Positive: better support for Postgres-specific features.
- Positive: smaller runtime (no generated client binary).
- Negative: smaller community than Prisma; some tooling (admin UIs) less mature.
- Negative: more boilerplate for simple CRUD; mitigated by helper packages.
- Migration cost: low (greenfield).
————————————————————————————————————————
## ADR-004 — Shared-Schema Multi-Tenancy with Row-Level organization_id
### Status
Accepted — 13-Apr-2026
### Context
We need tenant isolation that scales to 100K organisations without per-tenant DB sprawl. Options: schema-per-tenant, database-per-tenant, shared schema with tenant column.
### Decision
Single schema with organization_id on every tenant-scoped table. Postgres Row-Level Security policies enforce isolation as defence-in-depth. ORM wrapper enforces the WHERE organization_id = $current at the application layer; CI lint rule rejects any query missing it; integration test verifies cross-tenant reads return zero rows.
### Consequences
- Positive: scales to 100K+ tenants with one connection pool, simple migrations, easy aggregation queries.
- Positive: fewer surfaces to secure than per-tenant schemas.
- Negative: a single missing WHERE = data leak. Mitigated by 3-layer defence (RLS + ORM + lint + test).
- Negative: noisy-neighbour risk on read-heavy tenants — mitigated by read replicas and per-tenant rate limits.
- Enterprise customers may demand isolated DB; addressed by pricing tier (Enterprise+ option) without architecture rework.
————————————————————————————————————————
## ADR-005 — Clerk for Identity &amp; SSO
### Status
Accepted — 14-Apr-2026
### Context
We need SSO, MFA, organisations, role management, and SAML for enterprise deals. Building this in-house is expensive and a security liability. Candidates: Clerk, Auth0, Supabase Auth, AWS Cognito, custom.
### Decision
Clerk for the platform. Provides hosted UI, SDKs, organisations, MFA, session management, and SAML add-on. Auth0 retained as a contingency if Clerk pricing for enterprise SAML becomes prohibitive (&gt;= INR 1 Cr ARR from SAML-required customers).
### Consequences
- Positive: ships SSO + MFA + organisations + audit log Day-1.
- Positive: SAML available as paid add-on without engineering cost.
- Positive: Clerk's React SDK aligns with Next.js App Router.
- Negative: vendor concentration; mitigated by abstracting auth behind our own session contract — switch to Auth0 estimated at 4 weeks if needed.
- Negative: Clerk's primary region is US; data residency for India requires either Clerk's Indian region (announced for EOY 2026) or Auth0 fallback.
————————————————————————————————————————
## ADR-006 — Integration Tests Use a Real Postgres, Not Mocks
### Status
Accepted — 16-Apr-2026
### Context
Database mocks save test time but historically have produced false-green tests when the mock diverges from real Postgres semantics (NULL handling, transaction visibility, generated columns). Tenant isolation is the highest-stakes property in WBMSG; we cannot afford false confidence.
### Decision
Integration tests for any service touching the DB run against a real Postgres (testcontainers in CI; local Docker in dev). Unit tests can stub at the service-call layer but never at the DB-driver layer.
### Consequences
- Positive: tests catch real Postgres edge cases, especially around RLS, transactions, and tenant queries.
- Positive: a single source of truth for query behaviour.
- Negative: longer CI test runs (~+3 min); mitigated by parallel test sharding and Turborepo cache.
- Negative: requires Docker locally; covered in onboarding.
————————————————————————————————————————
## ADR-007 — Turborepo + pnpm Workspaces; Reject Nx (For Now)
### Status
Accepted — 18-Apr-2026
### Context
We need monorepo tooling: incremental build, remote cache, and a task graph. Candidates: Nx, Turborepo, Lage, Rush. Nx offers the richest feature set but its plugin/generator model has historically introduced lock-in and its TypeScript config is opinionated.
### Decision
Adopt Turborepo + pnpm workspaces. Re-evaluate Nx if monorepo grows beyond 30 packages or if cross-package dependency analysis becomes a bottleneck.
### Consequences
- Positive: lower-overhead tool that does one thing well — task orchestration with caching.
- Positive: pnpm strictness catches phantom dependencies our team has hit before.
- Positive: Vercel-native remote cache for free.
- Negative: less batteries-included than Nx (no generators); mitigated by hand-rolled scaffolds in /scripts.
- Re-evaluation gate: 30 packages or noticeable build-graph slowness.
————————————————————————————————————————
## ADR-008 — Multi-LLM Strategy with In-Repo Abstraction
### Status
Accepted — 20-Apr-2026
### Context
AI features need to operate even when a single LLM provider is unavailable. Pricing and capability between OpenAI and Anthropic shift quarterly; Indian customers may demand on-shore inference (Sarvam, Krutrim) within two years. We must avoid both single-vendor lock-in and vendor-sprawl chaos.
### Decision
Build a thin abstraction (packages/ai-router) that exposes a model-agnostic Chat / Embed / RAG API. OpenAI is primary; Anthropic is fallback with automatic switch on 5-min sustained failure rate &gt; 5%. Provider-specific features remain available behind feature flags but the default path is portable.
### Consequences
- Positive: provider outages do not page on-call beyond a routing decision.
- Positive: pricing and quality tracked quarterly; can re-route for cost without code change.
- Positive: roadmap-ready for on-shore inference when relevant.
- Negative: abstraction tax — provider-specific features (function-calling variants, structured output) require per-provider adapters.
- Negative: testing must mock at the abstraction layer (allowed exception to ADR-006 for cost reasons).
————————————————————————————————————————
## 4. Future ADR Candidates (Backlog)
- ADR-009 — Self-host fallback for the Vercel layer (Enterprise optional).
- ADR-010 — Event-bus choice (Kafka vs Postgres-listen vs Pub/Sub).
- ADR-011 — Vector store: pgvector vs dedicated (Pinecone, Weaviate).
- ADR-012 — Mobile shell (PWA vs React Native vs both) for Year-2 mobile push.
- ADR-013 — Search platform (Postgres FTS vs Meilisearch vs Elasticsearch).
- ADR-014 — Payments stack (Stripe + Razorpay vs unified processor).
- ADR-015 — Logging consolidation (Datadog Logs vs OpenSearch).
## 5. Authoring Guidance
- Open a PR with a new file at /docs/adr/NNNN-short-title.md.
- Use the Nygard template; keep to one or two pages each.
- Tag #adr-review in Slack; ≥ 2 Tech Leads must approve.
- Once Accepted, the ADR is immutable; supersede via a new ADR linking back.
## 6. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | Tech Leads + VPE | Baseline of 8 ADRs at end of Sprint 0 |

End of ADR Index | WBMSG v1.0 | April 2026 | Michael Nygard pattern