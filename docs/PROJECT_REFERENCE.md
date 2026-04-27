# TrustCRM — Project Reference

> **For Claude:** This is the single consolidated reference for the TrustCRM project. Read this file for complete project context. Each section links to the full document in `docs/` for deeper detail. The `CLAUDE.md` at the repo root contains coding-specific instructions (commands, ESM gotchas, testing rules, etc.) — read both.

---

## 1. Project Identity

| Field | Value |
| --- | --- |
| Project Name | TrustCRM — WhatsApp-First CRM for SMBs |
| Project Code | TRUST-2026 |
| Version | 1.0 |
| Charter Date | 26 April 2026 |
| Expected GA | Sprint 24 — March 2027 |
| Budget | INR 14.6 Cr (CapEx + 12 mo OpEx) |
| Executive Sponsor | CEO |
| Document Classification | Strictly Confidential |

**Mission:** India has 64M+ MSMEs and 535M WhatsApp users, yet existing CRM tools either ignore WhatsApp (Salesforce, HubSpot, Zoho) or focus on chat alone with surprise pricing (WATI, AiSensy, Interakt). TrustCRM closes that gap with a transparent-pricing, AI-augmented, WhatsApp-first CRM purpose-built for 1–50 employee SMBs, with white-label sub-account architecture for agencies.

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
- Microservices-oriented with clear separation of concerns
- Event-driven for real-time features and async processing
- API-first (mobile, web, third-party)
- Zero-trust security, end-to-end encryption
- Cloud-native on AWS with auto-scaling

**Full document:** [TrustCRM_Technical_Architecture_v1.0.md](TrustCRM_Technical_Architecture_v1.0.md)

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

**Full document:** [TrustCRM_Database_Schema_v1.0.md](TrustCRM_Database_Schema_v1.0.md)

---

## 5. API Specification

**Base URL:** `https://api.trustcrm.com/v1`  
**Protocol:** HTTPS only (TLS 1.3)  
**Format:** `application/json`

**Authentication:**

| Method | Use Case | Header |
| --- | --- | --- |
| User JWT (Clerk) | Web/mobile user sessions | `Authorization: Bearer <jwt_token>` |
| API Key | Third-party / server-to-server | `X-API-Key: <api_key>` |
| Webhook Signature | Incoming from WhatsApp/Stripe | `X-Hub-Signature-256: sha256=...` |

**Response format:**
```json
// Success
{ "data": { ... }, "meta": { "timestamp": "2026-04-26T10:30:00Z" } }

// Error
{ "error": { "code": "RESOURCE_NOT_FOUND", "message": "...", "timestamp": "..." } }
```

**Pagination:** Cursor-based. `GET /v1/contacts?limit=50&cursor=<token>`  
Response includes `pagination.next_cursor` and `pagination.has_more`.

**Rate limiting:** 429 Too Many Requests; `Retry-After` header indicates when to retry.

**Key endpoint groups:** `/v1/contacts`, `/v1/conversations`, `/v1/messages`, `/v1/templates`, `/v1/campaigns`, `/v1/flows`, `/v1/organizations`, `/v1/webhooks`

**Full document:** [TrustCRM_API_Specification_v1.0.md](TrustCRM_API_Specification_v1.0.md)

---

## 6. Product Modules (9 Modules)

| # | Module | Owner Pod | Sprint Range | Description |
| --- | --- | --- | --- | --- |
| M1 | Authentication & Multi-Tenancy | Platform | S1–S3 | Clerk integration, organization model, RLS, RBAC, user invitations |
| M2 | Contact & Lead Management | CRM | S2–S6 | Contact profiles, custom fields, tags, import/export, lifecycle stages, segments |
| M3 | WhatsApp Inbox & Conversations | Messaging | S4–S10 | Real-time inbox, message threads, send/receive, media, search, routing |
| M4 | Template & Campaign Manager | Messaging | S7–S12 | Template builder, Meta approval flow, campaign scheduler, broadcast engine |
| M5 | AI Agents & Automation Builder | AI & Automation | S9–S16 | Smart replies, intent detection, flow builder, chatbots, voice transcription |
| M6 | Analytics & Reporting | AI & Automation | S11–S18 | Dashboard, conversation analytics, Trust Score, campaign metrics, ML predictions |
| M7 | Billing & Subscription | Platform | S13–S17 | Stripe integration, plan tiers, usage metering, invoicing, self-serve upgrades |
| M8 | Agency / Sub-Account Mode | Platform | S15–S20 | White-label sub-accounts, agency dashboard, tenant management |
| M9 | Marketplace & Integrations | Platform | S18–S24 | Shopify, Razorpay, Zapier, public API, webhook management, partner ecosystem |

---

## 7. 24-Sprint Roadmap

**Sprint length:** 2 weeks (10 working days)  
**Total:** 24 sprints = 12 months

| Phase | Sprints | Duration | Outcome |
| --- | --- | --- | --- |
| Foundation | 1–6 | Months 1–3 | Working internal alpha: auth, WhatsApp send/receive, basic inbox |
| Core CRM | 7–12 | Months 3–6 | Closed beta: contacts, deals, templates, campaigns, routing |
| AI & Automation | 13–18 | Months 6–9 | Public beta: AI features, voice, flow builder, predictions |
| Scale & Polish | 19–24 | Months 9–12 | General Availability: mobile, integrations, compliance, launch |

**Current status (April 2026):** Sprint 1 in progress.

| Sprint | Title | Goals |
| --- | --- | --- |
| 1 | Project Bootstrapping | Monorepo, CI/CD, dev environments, IaC, team onboarding |
| 2 | Auth & Multi-tenancy | Clerk, org model, RLS, RBAC, user invitations |
| 3 | WhatsApp Cloud API | WABA setup, webhook receiver, message send/receive, phone provisioning |
| 4 | Core DB & API Skeleton | PostgreSQL schema, Prisma, base Fastify API, CRUD, OpenAPI |
| 5 | Web App Shell | Next.js App Router, auth pages, nav shell, design system, Tailwind |
| 6 | Inbox MVP | Real-time inbox, Socket.io, conversation list, message thread, basic search |
| 7 | Contacts & Companies | Contact profiles, custom fields, tags, CSV import/export, bulk ops |
| 8 | Lifecycle Stages & Segments | Stage management, dynamic segment builder, real-time membership |
| 9 | Templates & Approvals | Template builder UI, Meta submission, approval sync, multi-language |
| 10 | Campaign Scheduler | Campaign planner, audience selection, send-time optimization, delivery tracking |
| 11 | Deals & Pipelines | Deal records, Kanban pipeline view, stage transitions, activity timeline |
| 12 | Routing & Assignment | Conversation routing rules, team queues, SLA tracking, closed beta launch |
| 13 | Smart Replies (AI) | Claude API integration, intent detection, sentiment, AI reply suggestions |
| 14 | Voice Transcription | Whisper integration, voice note transcription, search indexed transcripts |
| 15 | Flow Builder | Visual automation builder, trigger config, action nodes, flow testing |
| 16 | Chatbot Engine | Bot session management, escalation logic, bot analytics |
| 17 | Analytics Dashboard | Core metrics dashboard, conversation analytics, team performance |
| 18 | Trust Score & ML | Contact Trust Score model, churn prediction, LTV prediction |
| 19 | Mobile App | React Native inbox, conversations, contact management, push notifications |
| 20 | Agency Sub-Accounts | Sub-account creation, agency dashboard, branding config |
| 21 | Shopify Integration | Product catalog sync, order context, abandoned cart automation |
| 22 | SOC 2 & Compliance | Security controls, audit logging, DPDP Act, penetration testing |
| 23 | Scale & Performance | Load testing, DB optimization, CDN tuning, 99.9% uptime prep |
| 24 | GA Launch | Final QA, marketing site, public launch, onboarding wizard, support ready |

**Full document:** [TrustCRM_Sprint_Execution_Plan_v1.0.md](TrustCRM_Sprint_Execution_Plan_v1.0.md)

---

## 8. Team Structure

**16 people across 4 cross-functional pods:**

| Pod | Size | Responsibilities |
| --- | --- | --- |
| Platform Pod | 4–5 | Auth, multi-tenancy, infrastructure, observability, DevOps |
| Messaging Pod | 4–5 | Inbox, conversations, templates, campaigns, WhatsApp integration |
| CRM Pod | 3–4 | Contacts, companies, deals, pipelines, custom fields, segments |
| AI & Automation Pod | 3–4 | Smart replies, voice transcription, flows, chatbots, ML predictions, Trust Score |

**Each pod:** 1 Tech Lead (50% coding / 50% architecture), 2–3 Engineers, 0.5 Product Designer (shared), 0.5 PM (shared), 0.5 QA (embedded)

**Shared roles:** Engineering Manager/VP Eng (delivery), CPO (roadmap), Design Lead (design system), QA Lead (test strategy), Security Engineer (embedded with Platform), SRE (joins Sprint 12)

**Full document:** [TrustCRM_RACI_Stakeholder_Matrix_v1.0.md](TrustCRM_RACI_Stakeholder_Matrix_v1.0.md)

---

## 9. Key Coding Standards

- **TypeScript strict mode everywhere.** `strict: true` in all tsconfigs.
- **Branded types for all domain IDs.** Never use plain `string` for IDs: `type ContactId = string & { readonly __brand: "ContactId" }`.
- **API is native ESM.** `"type": "module"`, relative imports must use `.js` extension.
- **No magic numbers.** Extract constants with descriptive names.
- **No commented-out code.** Delete it; git history is the backup.
- **Error handling at boundaries only.** Don't wrap internal code in try/catch unless it's a genuine boundary (user input, external API, DB).
- **Prisma for all DB access.** Never raw SQL except for RLS policy setup.
- **No `any` types.** Use `unknown` + type guards if necessary.
- **Test with Vitest (API).** Always `Fastify({ logger: false })` in tests. Use `app.inject()` for route tests.

**Full document:** [TrustCRM_Coding_Standards_Best_Practices_v1.0.md](TrustCRM_Coding_Standards_Best_Practices_v1.0.md)

---

## 10. Security & Compliance

- **Authentication:** Clerk JWTs, validated on every request. API keys hashed (never stored plaintext).
- **Multi-tenancy isolation:** PostgreSQL RLS — all data access gated at DB level by `organization_id`.
- **Encryption:** TLS 1.3 in transit, AES-256 at rest (RDS, S3, ElastiCache).
- **DPDP Act 2023:** Indian data privacy compliance — data residency in `ap-south-1` (Mumbai), right to erasure, consent tracking.
- **SOC 2 Type II:** Audit readiness target Sprint 22 (Feb 2027).
- **Secrets:** AWS Secrets Manager for all credentials. Never in env files committed to git.
- **WAF:** Cloudflare WAF in front of all public endpoints.

**Full documents:** [TrustCRM_Information_Security_Policy_v1.0.md](TrustCRM_Information_Security_Policy_v1.0.md) | [TrustCRM_Data_Privacy_DPDP_Policy_v1.0.md](TrustCRM_Data_Privacy_DPDP_Policy_v1.0.md)

---

## 11. NFRs (Non-Functional Requirements)

| Requirement | Target |
| --- | --- |
| API p95 latency | ≤ 300 ms (from Sprint 14) |
| Uptime | 99.9% monthly SLA |
| WhatsApp message delivery | ≤ 5 seconds p95 |
| Concurrent users | 10,000+ without degradation |
| Data backup | RPO ≤ 1 hour, RTO ≤ 4 hours |
| Search response | ≤ 200 ms p95 (Meilisearch) |

**Full document:** [TrustCRM_NFR_Specification_v1.0.md](TrustCRM_NFR_Specification_v1.0.md)

---

## 12. Document Index

All source documents are in `trustcrm/docs/`. Each is a converted Markdown file from the original specification.

| Document | Purpose |
| --- | --- |
| [TrustCRM_Project_Charter_v1.0.md](TrustCRM_Project_Charter_v1.0.md) | Project authorization, scope, stakeholders, success criteria |
| [TrustCRM_PRD_v2_0_Complete.md](TrustCRM_PRD_v2_0_Complete.md) | Full Product Requirements Document — all 9 modules |
| [TrustCRM_PRD_Traceability_Matrix.md](TrustCRM_PRD_Traceability_Matrix.md) | Requirement → sprint → test case traceability |
| [TrustCRM_SRS_v1.0.md](TrustCRM_SRS_v1.0.md) | Software Requirements Specification |
| [TrustCRM_Technical_Architecture_v1.0.md](TrustCRM_Technical_Architecture_v1.0.md) | Full technical architecture: components, data flow, deployment |
| [TrustCRM_Database_Schema_v1.0.md](TrustCRM_Database_Schema_v1.0.md) | 32-table schema with column specs and indexes |
| [TrustCRM_API_Specification_v1.0.md](TrustCRM_API_Specification_v1.0.md) | REST API v1 reference — endpoints, auth, response format |
| [TrustCRM_Sprint_Execution_Plan_v1.0.md](TrustCRM_Sprint_Execution_Plan_v1.0.md) | 24-sprint delivery roadmap with goals per sprint |
| [TrustCRM_NFR_Specification_v1.0.md](TrustCRM_NFR_Specification_v1.0.md) | Performance, availability, security NFRs |
| [TrustCRM_Test_Strategy_v1.0.md](TrustCRM_Test_Strategy_v1.0.md) | Testing approach: unit, integration, E2E, load testing |
| [TrustCRM_Coding_Standards_Best_Practices_v1.0.md](TrustCRM_Coding_Standards_Best_Practices_v1.0.md) | Coding standards, patterns, and review checklist |
| [TrustCRM_ADR_Index_v1.0.md](TrustCRM_ADR_Index_v1.0.md) | Architecture Decision Records index |
| [TrustCRM_UI_UX_Design_System_v1.0.md](TrustCRM_UI_UX_Design_System_v1.0.md) | Design tokens, component library, UX patterns |
| [TrustCRM_Developer_Onboarding_Guide_v1.0.md](TrustCRM_Developer_Onboarding_Guide_v1.0.md) | New engineer setup, repo structure, first-PR guide |
| [TrustCRM_End_User_Manual_v1.0.md](TrustCRM_End_User_Manual_v1.0.md) | Product user manual for SMB customers |
| [TrustCRM_RACI_Stakeholder_Matrix_v1.0.md](TrustCRM_RACI_Stakeholder_Matrix_v1.0.md) | RACI chart and stakeholder map |
| [TrustCRM_Risk_Register_v1.0.md](TrustCRM_Risk_Register_v1.0.md) | Project risks, mitigations, and owners |
| [TrustCRM_Information_Security_Policy_v1.0.md](TrustCRM_Information_Security_Policy_v1.0.md) | Security policies, controls, and responsibilities |
| [TrustCRM_Data_Privacy_DPDP_Policy_v1.0.md](TrustCRM_Data_Privacy_DPDP_Policy_v1.0.md) | DPDP Act 2023 compliance policy |
| [TrustCRM_DR_BCP_v1.0.md](TrustCRM_DR_BCP_v1.0.md) | Disaster Recovery and Business Continuity Plan |
| [TrustCRM_SLA_SLO_SLI_Specification_v1.0.md](TrustCRM_SLA_SLO_SLI_Specification_v1.0.md) | Service level agreements, objectives, and indicators |
| [TrustCRM_Incident_Management_Plan_v1.0.md](TrustCRM_Incident_Management_Plan_v1.0.md) | P1–P4 incident severity, escalation, and runbook |
| [TrustCRM_Change_Release_Management_Plan_v1.0.md](TrustCRM_Change_Release_Management_Plan_v1.0.md) | Release process, change advisory, rollback procedures |
| [TrustCRM_Operations_Runbook_SOPs_v1.0.md](TrustCRM_Operations_Runbook_SOPs_v1.0.md) | Operational runbook and standard operating procedures |
| [TrustCRM_Documentation_Package_Index_v1.1.md](TrustCRM_Documentation_Package_Index_v1.1.md) | Master index of all project documents |
