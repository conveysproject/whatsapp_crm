# WBMSG
# Sprint Execution Plan
## 12-Month Delivery Roadmap
Version 1.0 | April 2026
Strictly Confidential

| Document Owner | VP Engineering / Head of Delivery |
| --- | --- |
| Sprint Length | 2 weeks (10 working days) |
| Total Sprints | 24 sprints across 4 quarters (12 months) |
| Methodology | Scrum with continuous deployment |
| Tooling | Linear (planning), GitHub (code), Slack (comms), Datadog (observability) |

# Table of Contents

# 1. Executive Summary
This document defines the complete sprint-by-sprint execution plan to deliver WBMSG from initial setup through general availability over a 12-month period. The plan is structured around 24 two-week sprints organized into four delivery phases, each producing shippable, testable increments aligned with our PRD requirements.
## 1.1 Phase Structure

| Phase | Sprints | Duration | Outcome |
| --- | --- | --- | --- |
| Foundation | 1-6 | Months 1-3 | Working internal alpha: auth, WhatsApp send/receive, basic inbox |
| Core CRM | 7-12 | Months 3-6 | Closed beta: contacts, deals, templates, campaigns, routing |
| AI &amp; Automation | 13-18 | Months 6-9 | Public beta: AI features, voice, flow builder, predictions |
| Scale &amp; Polish | 19-24 | Months 9-12 | General Availability: mobile, integrations, compliance, launch |

# 2. Team Structure
WBMSG development is organized into four cross-functional pods, each owning a specific product area and operating with full autonomy to ship features end-to-end.
## 2.1 Pod Structure

| Pod | Members | Responsibilities |
| --- | --- | --- |
| Platform Pod | 4-5 | Auth, multi-tenancy, infrastructure, observability, DevOps |
| Messaging Pod | 4-5 | Inbox, conversations, templates, campaigns, WhatsApp integration |
| CRM Pod | 3-4 | Contacts, companies, deals, pipelines, custom fields, segments |
| AI &amp; Automation Pod | 3-4 | Smart replies, voice transcription, flows, chatbots, ML predictions, Trust Score |

## 2.2 Pod Composition
Each pod typically contains:
1 Tech Lead (senior engineer, 50% coding + 50% architecture/mentoring)
2-3 Software Engineers (mix of senior and mid-level)
1 Product Designer (shared across two pods)
0.5 Product Manager (shared across pods within phase focus)
0.5 QA Engineer (embedded part-time, full-time during release sprints)

## 2.3 Shared Roles
Engineering Manager / VP Engineering: Owns delivery, removes blockers, hires
Product Lead / CPO: Owns roadmap, prioritization, customer feedback
Design Lead: Owns design system, brand consistency, UX research
QA Lead: Owns test strategy, automation framework, release certification
Security Engineer: Embedded with Platform pod, owns security and compliance
Site Reliability Engineer (SRE): Joins from Sprint 12, owns production reliability

# 3. Sprint Ceremonies
Each sprint follows a consistent rhythm of ceremonies designed to maintain focus, surface blockers early, and ensure continuous improvement. Ceremonies are kept lean, with strict timeboxes.

| Ceremony | Cadence | Duration | Purpose &amp; Attendees |
| --- | --- | --- | --- |
| Sprint Planning | Day 1 of sprint | 90 minutes | Pod selects backlog items, breaks into tasks, commits to sprint goal. Whole pod + PM. |
| Daily Standup | Daily | 15 minutes | Quick sync on progress, blockers, plan for the day. Pod only. |
| Backlog Refinement | Mid-sprint | 60 minutes | Groom upcoming stories, estimate, clarify acceptance criteria. Pod + PM. |
| Sprint Review / Demo | Day 10 of sprint | 60 minutes | Demo working software to stakeholders, gather feedback. Pod + leadership + invited guests. |
| Sprint Retrospective | Day 10 of sprint | 60 minutes | What went well, what didn&apos;t, what to improve. Pod only, psychologically safe space. |
| Cross-Pod Sync | Weekly | 30 minutes | Tech leads + EM align on dependencies, shared concerns, architectural decisions. |
| Quarterly Planning | Every 6 sprints | Half day | Review phase outcomes, set OKRs for next phase, align roadmap. All hands. |

# 4. 24-Sprint Roadmap
Below is the complete sprint-by-sprint plan. Each sprint is scoped to deliver a working, testable increment that builds on previous sprints.

| # | Phase | Sprint Title | Sprint Goals |
| --- | --- | --- | --- |
| 1 | Foundation | Project Bootstrapping | Set up monorepo, CI/CD, dev environments, basic infra-as-code, team onboarding |
| 2 | Foundation | Authentication &amp; Multi-tenancy | Clerk integration, organization model, RLS policies, user invitations, role-based access control |
| 3 | Foundation | WhatsApp Cloud API Integration | Meta WABA setup, webhook receiver, message send/receive, phone number provisioning, embedded signup flow |
| 4 | Foundation | Core Database &amp; API Skeleton | PostgreSQL schema, Prisma setup, base Fastify API, contacts/conversations/messages CRUD, OpenAPI spec |
| 5 | Foundation | Web App Shell | Next.js App Router setup, auth pages, navigation shell, design system foundation, Tailwind config |
| 6 | Foundation | Inbox MVP | Real-time inbox with Socket.io, conversation list, message thread, send/receive UI, basic search |
| 7 | Core CRM | Contacts &amp; Companies | Contact profile pages, custom fields engine, tags system, contact import/export (CSV), bulk operations |
| 8 | Core CRM | Lifecycle Stages &amp; Segments | Lifecycle stage management, dynamic segments builder, segment evaluation engine, real-time membership updates |
| 9 | Core CRM | Templates &amp; Approvals | Template builder UI, Meta template submission, approval status sync, template categories, multi-language support |
| 10 | Core CRM | Campaigns &amp; Broadcasts | Campaign builder, audience selection, scheduling, send rate management, delivery tracking, opt-out handling |
| 11 | Core CRM | Deals &amp; Pipelines | Pipeline builder, kanban deal board, deal stages, custom fields per pipeline, deal value tracking, win/loss |
| 12 | Core CRM | Conversation Routing &amp; SLA | Auto-assignment rules, team-based routing, SLA tracking, escalation policies, conversation labels |
| 13 | AI &amp; Automation | Voice Notes &amp; Transcription | Whisper integration, voice note playback UI, transcription cache, multi-language support, search transcripts |
| 14 | AI &amp; Automation | AI Smart Replies | Claude API integration, context-aware reply suggestions, tone matching, language detection, A/B testing framework |
| 15 | AI &amp; Automation | Intent &amp; Sentiment Detection | Real-time message classification, sentiment scoring, intent labels, auto-tagging, dashboard insights |
| 16 | AI &amp; Automation | Flow Builder Foundation | Visual flow builder UI (drag-drop), node types (trigger/action/condition/delay), flow execution engine, version control |
| 17 | AI &amp; Automation | Chatbots &amp; FAQ Bots | Knowledge base ingestion, RAG-based bot, handoff to human agent, conversation memory, training data UI |
| 18 | AI &amp; Automation | Predictive Analytics | Churn prediction model, LTV estimation, upsell recommendations, ML service deployment, model monitoring |
| 19 | Scale &amp; Polish | Trust Score System | 6-dimension scoring algorithm, daily computation jobs, recommendations engine, score history, UI dashboard |
| 20 | Scale &amp; Polish | Mobile App MVP | React Native iOS+Android, inbox view, push notifications, voice playback, offline message queue, OTA updates |
| 21 | Scale &amp; Polish | Integrations &amp; Webhooks | Shopify connector, Razorpay/Stripe payments, Zapier app, public webhook delivery system, API key management |
| 22 | Scale &amp; Polish | Analytics &amp; Reporting | Custom dashboards, export to CSV/Excel, scheduled reports, agent performance metrics, channel attribution |
| 23 | Scale &amp; Polish | Compliance &amp; Security Hardening | SOC 2 controls, DPDP compliance, audit logs UI, data export/deletion APIs, VAPT remediation, MFA enforcement |
| 24 | Scale &amp; Polish | Launch Readiness | Load testing (10k concurrent), DR drill, runbook completion, status page, documentation polish, GA launch prep |

# 5. Detailed Sprint Breakdown - Phase 1: Foundation
## Sprint 1: Project Bootstrapping
Sprint Goal: Establish the foundational engineering environment so all four pods can begin delivering features in Sprint 2.
Deliverables:
Monorepo structure (Turborepo) with apps/web, apps/api, apps/mobile, packages/shared
GitHub Actions CI: lint, type-check, unit tests on every PR
Terraform IaC for AWS staging environment (VPC, ECS, RDS, ElastiCache, S3)
Local dev environment via Docker Compose (Postgres, Redis, Meilisearch)
Engineering handbook: contribution guidelines, code style, branch naming, PR templates
Onboarding documentation and access provisioning for all 16 team members
Sentry, Datadog, PagerDuty accounts provisioned and connected

Definition of Done:
Any engineer can clone repo, run `npm install`, and have a working environment in &lt;30 minutes
PR pipeline runs in &lt;5 minutes for typical changes
Staging environment is reachable and serving a hello-world endpoint

Risks &amp; Mitigation:
Risk: AWS provisioning delays. Mitigation: Engage AWS account manager early, request quota increases proactively.
Risk: Onboarding bottleneck. Mitigation: Pair-program new hires with EM/CTO during week 1.

## Sprint 2: Authentication &amp; Multi-tenancy
Sprint Goal: Implement secure, multi-tenant authentication that powers every subsequent feature.
Deliverables:
Clerk integration for email/password and Google SSO
Organizations table with RLS policies enforced at PostgreSQL level
User invitation flow (email link with role assignment)
Role-Based Access Control: Admin, Manager, Agent, Viewer roles
JWT validation middleware in Fastify with organization scoping
Sign-up, sign-in, password reset, email verification UI
Settings page: org name, members list, role management

Acceptance Criteria:
New user signs up, creates org, invites a teammate, teammate accepts and joins org
Cross-org data access is impossible (verified via security test)
Removing a user revokes access within 60 seconds
All routes require authentication except public marketing pages

## Sprint 3: WhatsApp Cloud API Integration
Sprint Goal: Connect to Meta&apos;s WhatsApp Cloud API so the system can send and receive real WhatsApp messages.
Deliverables:
Meta Business Manager + WhatsApp Business Account (WABA) for WBMSG
Embedded signup flow: org connects their own WABA via OAuth
Webhook receiver endpoint with signature verification
Outbound message API: text, image, document, template messages
Message status tracking: sent, delivered, read, failed
Phone number provisioning UI
Test harness: send/receive messages between two test accounts

External Dependencies:
Meta Tech Provider partnership approved (must be initiated 6 weeks before this sprint)
Test phone numbers in 3 markets (India, UAE, Indonesia)

## Sprint 4: Core Database &amp; API Skeleton
Sprint Goal: Build the API surface that powers contacts, conversations, and messages.
Deliverables:
Complete PostgreSQL schema for Core + CRM + Messaging domains (~20 tables)
Prisma schema, migrations, and seed scripts
REST API: CRUD for contacts, conversations, messages with full validation
OpenAPI 3.0 spec auto-generated from Fastify schemas
API documentation site (Stoplight) deployed at developers.WBMSG.com
Postman collection for QA and partner testing

## Sprint 5: Web App Shell
Sprint Goal: Ship the application shell so feature pods can plug in their UIs starting Sprint 6.
Deliverables:
Next.js 15 App Router setup with Tailwind CSS and design tokens
Authentication pages connected to Clerk
Application shell: sidebar, top nav, breadcrumbs, organization switcher
Design system v1: Button, Input, Modal, Toast, Avatar, Badge, Card components
Storybook deployed for component documentation
Empty state pages for Inbox, Contacts, Campaigns, Settings

## Sprint 6: Inbox MVP
Sprint Goal: Complete Phase 1 with a working WhatsApp inbox: this is the alpha milestone for internal demo.
Deliverables:
Real-time conversation list (Socket.io) with unread counts
Message thread view with infinite scroll
Send message UI: text, emoji, attachment upload
Typing indicators and read receipts
Basic search across conversations
Mark as read/unread, archive conversation
Mobile-responsive layout (works on phone browser)

Phase 1 Exit Criteria:
Internal team uses WBMSG to manage all customer support WhatsApp messages
All Phase 1 features pass automated regression tests
Staging environment is stable for 7 consecutive days
Architecture review with engineering leadership: no blockers identified

# 6. Phase 2: Core CRM (Sprints 7-12)
Phase 2 transforms the inbox-only alpha into a full CRM platform. By the end of Phase 2, beta customers can run their entire WhatsApp customer lifecycle on WBMSG: from lead capture to deal close.
## Phase 2 Highlights
Sprint 7-8: Contact 360 view + custom fields + segments
Sprint 9-10: Template builder + campaign engine (this is the revenue feature)
Sprint 11: Deal pipelines for sales-led WhatsApp businesses
Sprint 12: SLA tracking and team routing for support use cases

Phase 2 Exit Criteria:
10 closed-beta customers using WBMSG in production
WhatsApp Tech Provider audit passed
Average campaign delivery rate ≥95%
Average customer retention through beta period ≥80%

# 7. Phase 3: AI &amp; Automation (Sprints 13-18)
Phase 3 introduces our differentiated AI features. This phase moves WBMSG from category-competitive to category-leading, making it the AI-first WhatsApp CRM.
## Phase 3 Highlights
Sprint 13: Voice notes + Whisper transcription (huge unlock for India market)
Sprint 14: AI Smart Replies powered by Claude with tone matching
Sprint 15: Real-time intent and sentiment detection
Sprint 16-17: Visual flow builder + RAG-powered chatbots
Sprint 18: Predictive analytics (churn, LTV, upsell)

Phase 3 Exit Criteria:
Public beta launched with self-serve signup
AI feature adoption ≥60% across active organizations
Average time-to-first-value &lt;15 minutes for new signups
AI infrastructure cost &lt;30% of revenue per organization

# 8. Phase 4: Scale &amp; Polish (Sprints 19-24)
Phase 4 prepares WBMSG for general availability. The focus shifts from feature breadth to depth, scale, security, and reliability.
## Phase 4 Highlights
Sprint 19: Trust Score system - our flagship differentiation feature
Sprint 20: Native iOS and Android apps via React Native
Sprint 21: Shopify, Razorpay, Stripe, Zapier integrations
Sprint 22: Custom dashboards and scheduled reports
Sprint 23: SOC 2 / DPDP compliance, security hardening
Sprint 24: Launch readiness - load testing, DR drill, GA preparation

GA Launch Criteria:
System sustains 10,000 concurrent users in load testing
99.9% uptime over 30-day measurement period
Zero P0 security findings in pre-launch VAPT
Documentation complete: user guide, API docs, video tutorials
Customer success team trained and runbooks complete

# 9. Definition of Done
A user story is considered Done only when ALL of the following criteria are met. There are no exceptions; partially-done work creates technical debt and erodes trust.
## 9.1 Code-Level Criteria
Code is written, peer-reviewed, and approved by at least 1 other engineer
Unit tests written with ≥80% coverage on new code
Integration tests added for new API endpoints
Code passes all linting, formatting, and type-checking gates
No new TODOs or FIXMEs without an associated tracking ticket
## 9.2 Quality Criteria
All acceptance criteria from the user story are verified
Manual QA completed (smoke test minimum, full test for high-risk areas)
No P0 or P1 bugs open against the feature
Performance budgets met (API &lt;300ms p95, page load &lt;3s)
Accessibility: keyboard navigation works, screen-reader compatible, WCAG AA
## 9.3 Documentation Criteria
API endpoints documented in OpenAPI spec
User-facing changes documented in product changelog
Architectural decisions captured in ADR (Architecture Decision Records)
Runbook updated for any new operational procedures
## 9.4 Deployment Criteria
Feature deployed to staging and verified working
Feature flag created for gradual rollout (if customer-facing)
Monitoring and alerts configured
Rollback plan documented

# 10. Risk Management
## 10.1 Top Risks &amp; Mitigations

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Meta API policy change | HIGH | Maintain dedicated Meta partner relationship; subscribe to all Meta developer announcements; weekly review of policy changes; abstract WhatsApp APIs behind internal interfaces. |
| WhatsApp pricing changes | HIGH | Diversify channels (add Instagram, RCS support in roadmap); pass through pricing transparently in our pricing model; build channel-arbitrage into routing. |
| AI cost overruns | MEDIUM | Per-organization cost monitoring with hard caps; cache AI responses aggressively; tier AI features by plan; explore self-hosted models for high-volume use cases. |
| Engineering hiring delays | MEDIUM | Start hiring 8 weeks before each phase begins; maintain a bench of 3+ candidates per role; partner with technical recruiting agency. |
| Compliance certification delays | MEDIUM | Engage SOC 2 auditor in Sprint 12 (parallel to development); embed compliance engineer in Platform pod from Sprint 1; design controls into the architecture. |
| Launch slip beyond 12 months | MEDIUM | Phase exit reviews with go/no-go decisions; cut scope before extending dates; maintain a kill list of deferrable features for each phase. |

# 11. Velocity &amp; Capacity Planning
Each pod is expected to deliver a sustained velocity over the 24-sprint period. Velocity is established in Sprints 1-3 and recalibrated quarterly.
## 11.1 Capacity Assumptions
10 working days per sprint (2 weeks, M-F)
70% capacity allocated to planned work; 30% reserved for bug fixes, technical debt, support
4 engineers per pod × 7 productive days per sprint × 6 hours/day = 168 productive hours per pod per sprint
After holidays, conferences, illness: ~140 effective hours per pod per sprint
## 11.2 Sprint Story Points Target
Pod target: 30-40 story points per sprint after stabilization
Total system throughput: ~140 story points per sprint across 4 pods
Total program: ~3,360 story points over 24 sprints
## 11.3 Velocity Health Indicators
Green: Velocity within 80-110% of historical average
Yellow: Velocity 60-80% of historical average for 2+ sprints (investigate root cause)
Red: Velocity &lt;60% of historical average (escalate to leadership, consider scope cut)

# 12. Communication &amp; Reporting
## 12.1 Reporting Cadence

| Report | Cadence | Audience &amp; Content |
| --- | --- | --- |
| Sprint Recap | Bi-weekly | Posted in Slack #engineering-updates: completed stories, demos, blockers |
| Engineering Health | Weekly | EM to leadership: velocity, on-call burden, hiring pipeline, technical debt status |
| Phase Review | Every 6 sprints | All hands: phase outcomes, learnings, next phase commitment |
| Investor Update | Monthly | Founders to investors: KPIs, milestones, key risks, asks |
| Customer Newsletter | Monthly | Product to customers: shipped features, upcoming roadmap, success stories |

End of Sprint Execution Plan
WBMSG v1.0 | April 2026 | Strictly Confidential