# WBMSG — Project Reference

> **For Claude:** Single consolidated reference. Read alongside `CLAUDE.md` (commands, ESM gotchas, testing rules).

---

## 1. Project Identity

| Field | Value |
| --- | --- |
| Project Name | WBMSG — WhatsApp-First CRM for SMBs |
| Project Code | TRUST-2026 |
| Expected GA | Sprint 24 — April 2026 |
| Executive Sponsor | CEO |

**Status:** All 24 sprints delivered — GA ready (April 2026).

**Mission:** India has 64M+ MSMEs and 535M WhatsApp users, yet existing CRM tools either ignore WhatsApp (Salesforce, HubSpot, Zoho) or focus on chat alone with surprise pricing (WATI, AiSensy, Interakt). WBMSG closes that gap with a transparent-pricing, AI-augmented, WhatsApp-first CRM purpose-built for 1–50 employee SMBs, with white-label sub-account architecture for agencies.

**Year 1 Targets (post-GA):**

| KPI | Target |
| --- | --- |
| Paying Accounts | 5,000 |
| ARR | INR 18 Cr |
| WhatsApp Active Businesses (North Star) | ≥ 75% |
| NPS | ≥ 50 |
| Gross Margin | ≥ 72% |
| Logo Churn | ≤ 4% / month |

---

## 2. Tech Stack

| Layer | Technology | Notes |
| --- | --- | --- |
| Web Frontend | Next.js 15 (App Router) + React 18 + TypeScript + Tailwind CSS | SSR, static optimization |
| Mobile | React Native + Expo 51 | Cross-platform iOS + Android, OTA updates |
| Backend | Node.js 20 + Fastify 4 + TypeScript (ESM) | High-throughput REST API, webhook handling |
| Database | PostgreSQL 16 (Aurora) + Prisma ORM | 32 tables, Row Level Security for multi-tenancy |
| Cache / Queue | Redis 7 + BullMQ | Session cache, job queues, pub/sub |
| Search | Meilisearch | Full-text search for contacts, conversations, messages |
| Auth | Clerk | JWT, SSO, MFA, organization management |
| Billing | Stripe | Subscriptions, usage metering, invoicing |
| WhatsApp | Meta WhatsApp Cloud API | Send/receive messages, template management |
| AI / LLM | Anthropic Claude API | Smart replies, intent detection, sentiment, summarization |
| Voice AI | OpenAI Whisper + ElevenLabs | Voice transcription (Whisper), text-to-speech (ElevenLabs) |
| Email | Resend + Amazon SES | Transactional (Resend), bulk (SES) |
| File Storage | AWS S3 / Cloudflare R2 | Media, attachments, exports, voice notes |
| CDN | Cloudflare | Global edge caching, DDoS protection, WAF |
| Monitoring | Datadog + PagerDuty + Sentry | APM, logging, alerts, on-call rotation |
| Infra | AWS (ECS, RDS Aurora, ElastiCache, S3) + Terraform | Cloud-native, auto-scaling |
| CI/CD | GitHub Actions | Lint, type-check, tests on every PR |
| State (web) | Zustand + React Query | Client state, server state caching |
| Real-time | Socket.io | WebSocket connections for inbox updates |
| Monorepo | Turborepo + pnpm workspaces | apps/web, apps/api, apps/mobile, packages/shared |
| ML Service | Python 3.11 + FastAPI | Predictive analytics, churn models, LTV prediction |

---

## 3. Architecture Overview

**Pattern:** Cloud-native, API-first, event-driven multi-tenant SaaS.

```
Client Layer    → Web (Next.js), Mobile (RN/Expo), Third-party API clients
Edge Layer      → Cloudflare CDN (static assets, DDoS, WAF)
API Gateway     → AWS ALB routing to Fastify API servers
Application     → Stateless API servers, webhook processors, Socket.io servers
Processing      → Background workers (BullMQ), ML prediction service (Python FastAPI)
Data            → PostgreSQL (primary), Redis (cache/queue/pubsub), Meilisearch (search), S3 (files)
Integration     → WhatsApp, Shopify, Clerk, Stripe, Claude, Whisper
```

**Multi-Tenancy:** Shared PostgreSQL database with Row Level Security (RLS). Every table has `organization_id`. RLS policies enforce that queries are automatically scoped to the authenticated organization — data isolation at the database level, not in application code.

**Key Principles:**
- Multi-tenant RLS isolation (PostgreSQL-level enforcement)
- Event-driven for real-time features and async processing
- API-first (mobile, web, third-party)
- Zero-trust security, end-to-end encryption
- Cloud-native on AWS with auto-scaling

---

## 4. Database Schema

**32 tables across 6 logical domains.** All tables include `organization_id` for RLS-based multi-tenancy.

| Domain | Tables | Description |
| --- | --- | --- |
| Core | 5 | organizations, users, teams, authentication, billing |
| CRM | 8 | contacts, companies, deals, pipelines, custom fields, lifecycle stages |
| Messaging | 7 | conversations, messages, templates, campaigns, broadcasts, channels |
| Automation | 4 | flows, flow executions, triggers, chatbots |
| Analytics | 4 | events, metrics, predictions, trust scores |
| Integration | 4 | connected accounts, webhooks, API keys, product catalog |

**Key tables:**

| Table | Key Columns |
| --- | --- |
| organizations | id (UUID), name, plan_tier (starter/growth/scale/enterprise), whatsapp_business_account_id, phone_number_id, settings (JSONB) |
| users | id (UUID, from Clerk), organization_id, email, full_name, role (admin/manager/agent/viewer), is_active |
| contacts | id, organization_id, phone_number (E.164), name, email, company_id, lifecycle_stage (lead/prospect/customer/loyal/churned), tags (TEXT[]), custom_fields (JSONB) |
| conversations | id, organization_id, contact_id, channel_type, status (open/pending/resolved/bot), assigned_to, last_message_at |
| messages | id, conversation_id, organization_id, direction (inbound/outbound), content_type, body, status (sent/delivered/read/failed) |
| templates | id, organization_id, name, category, language, meta_template_id, status (pending/approved/rejected) |
| flows | id, organization_id, name, trigger_type, is_active, flow_definition (JSONB) |
| api_keys | id, organization_id, key_hash, name, scopes (TEXT[]), last_used_at |

**Full document:** [WBMSG_Database_Schema_v1.0.md](WBMSG_Database_Schema_v1.0.md)

---

## 5. API Specification

**Base URL:** `https://api.WBMSG.com/v1`
**Protocol:** HTTPS only (TLS 1.3) · **Format:** `application/json`

**Authentication:**

| Method | Use Case | Header |
| --- | --- | --- |
| User JWT (Clerk) | Web/mobile user sessions | `Authorization: Bearer <jwt_token>` |
| API Key | Third-party / server-to-server | `X-API-Key: <api_key>` |
| Webhook Signature | Incoming from WhatsApp/Stripe | `X-Hub-Signature-256: sha256=...` |

**Response format:**
```json
{ "data": { ... }, "meta": { "timestamp": "2026-04-26T10:30:00Z" } }
{ "error": { "code": "RESOURCE_NOT_FOUND", "message": "...", "timestamp": "..." } }
```

**Pagination:** Cursor-based. `GET /v1/contacts?limit=50&cursor=<token>` → `pagination.next_cursor`, `pagination.has_more`

**Rate limiting:** 429 Too Many Requests; `Retry-After` header.

**Key endpoint groups:** `/v1/contacts` · `/v1/conversations` · `/v1/messages` · `/v1/templates` · `/v1/campaigns` · `/v1/flows` · `/v1/organizations` · `/v1/webhooks`

**Full document:** [WBMSG_API_Specification_v1.0.md](WBMSG_API_Specification_v1.0.md)

---

## 6. Product Modules

| # | Module | Owner Pod | Sprints |
| --- | --- | --- | --- |
| M1 | Authentication & Multi-Tenancy | Platform | S1–S3 |
| M2 | Contact & Lead Management | CRM | S2–S6 |
| M3 | WhatsApp Inbox & Conversations | Messaging | S4–S10 |
| M4 | Template & Campaign Manager | Messaging | S7–S12 |
| M5 | AI Agents & Automation Builder | AI & Automation | S9–S16 |
| M6 | Analytics & Reporting | AI & Automation | S11–S18 |
| M7 | Billing & Subscription | Platform | S13–S17 |
| M8 | Agency / Sub-Account Mode | Platform | S15–S20 |
| M9 | Marketplace & Integrations | Platform | S18–S24 |

---

## 7. Key Coding Standards

- **TypeScript strict mode everywhere.** `strict: true` in all tsconfigs.
- **Branded types for all domain IDs.** Never use plain `string` for IDs: `type ContactId = string & { readonly __brand: "ContactId" }`.
- **API is native ESM.** `"type": "module"`, relative imports must use `.js` extension.
- **No magic numbers.** Extract constants with descriptive names.
- **No commented-out code.** Delete it; git history is the backup.
- **Error handling at boundaries only.** Don't wrap internal code in try/catch unless it's a genuine boundary (user input, external API, DB).
- **Prisma for all DB access.** Never raw SQL except for RLS policy setup.
- **No `any` types.** Use `unknown` + type guards if necessary.
- **Test with Vitest (API).** Always `Fastify({ logger: false })` in tests. Use `app.inject()` for route tests.

**Full document:** [WBMSG_Coding_Standards_Best_Practices_v1.0.md](WBMSG_Coding_Standards_Best_Practices_v1.0.md)

---

## 8. Security & Compliance

- **Authentication:** Clerk JWTs, validated on every request. API keys hashed (never stored plaintext).
- **Multi-tenancy isolation:** PostgreSQL RLS — all data access gated at DB level by `organization_id`.
- **Encryption:** TLS 1.3 in transit, AES-256 at rest (RDS, S3, ElastiCache).
- **DPDP Act 2023:** Indian data privacy compliance — data residency in `ap-south-1` (Mumbai), right to erasure, consent tracking.
- **SOC 2 Type II:** Audit readiness delivered Sprint 22.
- **Secrets:** AWS Secrets Manager for all credentials. Never in env files committed to git.
- **WAF:** Cloudflare WAF in front of all public endpoints.

---

## 9. NFRs

| Requirement | Target |
| --- | --- |
| API p95 latency | ≤ 300 ms |
| Uptime | 99.9% monthly SLA |
| WhatsApp message delivery | ≤ 5 seconds p95 |
| Concurrent users | 10,000+ without degradation |
| Data backup | RPO ≤ 1 hour, RTO ≤ 4 hours |
| Search response | ≤ 200 ms p95 (Meilisearch) |
