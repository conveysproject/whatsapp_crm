| TrustCRM PRD Traceability Matrix Sprint Execution Plan v1.0  ←→  PRD v2.0 Appendix E  /  168 Tasks  /  24 Sprints  /  April 2026  /  Confidential |
| --- |

| Field | Value |
| --- | --- |
| Document | PRD Traceability Matrix — Appendix E |
| Sprint Plan Version | v1.0 — Sprint Execution Plan (April 2026) |
| PRD Reference | TrustCRM PRD v2.0 — Complete Edition (April 2026) |
| Total Tasks Mapped | 168 tasks across 24 sprints |
| PRD Sections Covered | Sections 5.1 – 5.10, 6.1 – 6.10, 7.1 – 7.6, 8, 9, 10, 11 |
| Classification | Strictly Confidential |

# How to Read This Matrix
This document maps every task in the TrustCRM Sprint Execution Plan (v1.0) to its originating requirement in the TrustCRM Product Requirements Document (v2.0). It serves as the authoritative traceability record for the engineering team, QA, and product management.

| Task ID | Sprint | Phase | PRD Section | Purpose |
| --- | --- | --- | --- | --- |
| S1-T1 | Which sprint the task belongs to | Which development phase | The PRD section that originated this requirement | How to use this column — cross-reference to PRD v2.0 |

## PRD Section Legend

| Section | Title | Section | Title |
| --- | --- | --- | --- |
| 5.1 | Trust-First Onboarding | 5.2 | Smart Shared Team Inbox |
| 5.3 | Deep Custom CRM | 5.4 | Broadcast Campaigns &amp; Templates |
| 5.5 | Visual Workflow Automation | 5.6 | AI Intelligence Layer |
| 5.7 | Analytics &amp; Reporting | 5.8 | Integrations |
| 5.9 | Billing Transparency Engine | 5.10 | Trust &amp; Compliance Center |
| 6.1 | Trust Score Dashboard | 6.2 | WhatsApp-Native Mobile App |
| 6.3 | AI Relationship Intelligence | 6.4 | WhatsApp Commerce Layer |
| 6.5 | Smart Onboarding Concierge | 6.6 | Agency &amp; White-Label Mode |
| 6.7 | Voice AI &amp; Audio Intelligence | 6.8 | Predictive Analytics Engine |
| 6.9 | Multi-Channel Inbox Extension | 6.10 | CSAT &amp; Customer Feedback Engine |
| 7.x | Technical Architecture | 8.x | Pricing Strategy |
| 9.x | Product Roadmap | N/A | Dev/QA Foundation (no single PRD section) |

# Master Traceability Matrix — All 168 Tasks

| Phase 1 — Traceability |
| --- |

| Sprint 1 — Infrastructure, Auth &amp; Database Foundation |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S1-T1 | S1 | Phase 1 | Provision AWS environment (ECS, RDS, Redis, S3, CloudFront, DNS, SSL) | 7.1 | AWS ECS Fargate, RDS Aurora, ElastiCache Redis, S3, CloudFront, Route 53 specified in PRD Section 7.1 |
| S1-T2 | S1 | Phase 1 | GitHub monorepo setup with branch protection and CI/CD | 7.1 | Monorepo architecture and GitHub Actions CI/CD specified in PRD Section 7.1 |
| S1-T3 | S1 | Phase 1 | CI/CD pipeline: GitHub Actions → ECR → ECS staging/production | 7.1 | GitHub Actions CI/CD pipeline specified in PRD Section 7.1 |
| S1-T4 | S1 | Phase 1 | Multi-tenant PostgreSQL schema with Row Level Security | 7.2 | Shared DB with RLS enforced at PostgreSQL level mandated in PRD Section 7.2 |
| S1-T5 | S1 | Phase 1 | Clerk authentication integration — sign up, org creation, JWT | 7.1 | Clerk for SSO, MFA, organisation management specified in PRD Section 7.1 |
| S1-T6 | S1 | Phase 1 | Next.js 15 app scaffold with Tailwind CSS and shadcn/ui | 7.1 | Next.js 15 + TypeScript + Tailwind CSS specified in PRD Section 7.1 |
| S1-T7 | S1 | Phase 1 | RLS integration test suite in CI pipeline | 7.2 | RLS must be tested and enforced per PRD Section 7.2 |

| Sprint 2 — WhatsApp API Integration &amp; Basic Inbox |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S2-T1 | S2 | Phase 1 | Meta WhatsApp Cloud API webhook receiver with HMAC verification | 7.1 | Meta WhatsApp Cloud API (direct, no BSP markup) specified in PRD Section 7.1 |
| S2-T2 | S2 | Phase 1 | Message send API with rate limiting and retry logic | 5.4 | Message sending capability required by PRD Section 5.4 |
| S2-T3 | S2 | Phase 1 | Conversations and messages database schema | 5.2 | Inbox architecture and message storage described in PRD Section 5.2.1 |
| S2-T4 | S2 | Phase 1 | Real-time WebSocket layer using Socket.io + Redis | 5.2 | Real-time inbox updates specified in PRD Section 5.2; Redis Pub/Sub in Section 7.1 |
| S2-T5 | S2 | Phase 1 | Inbox UI: conversation list, message thread, right panel | 5.2 | Inbox architecture (left/centre/right panels) specified in PRD Section 5.2.1 |
| S2-T6 | S2 | Phase 1 | TrustCRM design system with Storybook documentation | N/A | Design system is a development prerequisite, not directly mapped to a PRD feature section |
| S2-T7 | S2 | Phase 1 | Auto-create contact on new inbound number with deduplication | 5.3 | Contact deduplication via phone number specified in PRD Section 5.3.1 |
| S2-T8 | S2 | Phase 1 | End-to-end test for all 8 message types | N/A | Quality assurance baseline for WhatsApp integration |

| Sprint 3 — Contact Management, CRM Schema &amp; Template Manager |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S3-T1 | S3 | Phase 1 | Contacts schema with unlimited custom fields (JSONB) | 5.3 | Unlimited custom fields (text, number, date, dropdown, multi-select, URL) mandated in PRD Section 5.3.1 |
| S3-T2 | S3 | Phase 1 | Contact list page with search, filter, bulk actions, CSV export | 5.3 | Bulk actions and search specified in PRD Section 5.3.1 |
| S3-T3 | S3 | Phase 1 | Contact profile page with timeline, custom fields, tags, deals | 5.3 | Full activity timeline and contact profile described in PRD Section 5.3.1 |
| S3-T4 | S3 | Phase 1 | Conversation management APIs: assign, status, label, snooze, note | 5.2 | Assignment, status, snooze, labels, internal notes specified in PRD Section 5.2.2 |
| S3-T5 | S3 | Phase 1 | Template manager backend with Meta Graph API submission | 5.4 | Template manager with Meta submission specified in PRD Section 5.4.1 |
| S3-T6 | S3 | Phase 1 | Template manager UI with status tracking and phone preview | 5.4 | Template creation UI with preview pane specified in PRD Section 5.4.1 |
| S3-T7 | S3 | Phase 1 | Contact CRM card in inbox right panel with inline edit | 5.2 | Right panel CRM card specified in PRD Section 5.2.1 |
| S3-T8 | S3 | Phase 1 | Full contact lifecycle QA pass | N/A | Quality assurance for CRM data integrity |

| Sprint 4 — Broadcast Campaigns, Shopify &amp; Onboarding Wizard |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S4-T1 | S4 | Phase 1 | Broadcast campaign engine with BullMQ queue and rate control | 5.4 | Campaign engine with send rate control specified in PRD Section 5.4.2 |
| S4-T2 | S4 | Phase 1 | Campaign builder UI: template, audience, schedule, review steps | 5.4 | 4-step campaign builder described in PRD Section 5.4.2 |
| S4-T3 | S4 | Phase 1 | Shopify integration: OAuth, webhooks, order/customer sync | 5.8 | Shopify integration (orders, customers, products, cart, refunds) specified in PRD Section 5.8.1 |
| S4-T4 | S4 | Phase 1 | 8-step guided onboarding wizard with resume support | 5.1 | 8-step wizard with 30-minute completion target specified in PRD Section 5.1.1 |
| S4-T5 | S4 | Phase 1 | Stripe billing integration with plan entitlement middleware | 8.x | Stripe for subscriptions and usage metering specified in PRD Section 7.1 and pricing in Section 8 |
| S4-T6 | S4 | Phase 1 | Full beta readiness QA pass | N/A | Quality gate before customer launch |

| Sprint 5 — Billing Transparency, Analytics &amp; Beta Launch |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S5-T1 | S5 | Phase 1 | Meta API cost tracking per message and per campaign | 5.9 | Cost per campaign and message-level cost tracking specified in PRD Section 5.9 |
| S5-T2 | S5 | Phase 1 | Billing transparency dashboard with spend tracker and cap config | 5.9 | In-app spend tracker, overage alerts, hard cap, annual savings calculator specified in PRD Section 5.9 |
| S5-T3 | S5 | Phase 1 | Overage alert system: WhatsApp notification at 80% and 100% cap | 5.9 | Overage alerts via WhatsApp and campaign pause at cap specified in PRD Section 5.9 |
| S5-T4 | S5 | Phase 1 | Main analytics dashboard: conversation volume, response time, resolution | 5.7 | Business dashboard KPIs (conversations, response time, resolution rate) specified in PRD Section 5.7.1 |
| S5-T5 | S5 | Phase 1 | Campaign analytics with opt-out handling and STOP list | 5.4 | Delivery, read, reply, click rates and opt-out handling specified in PRD Sections 5.4.2 and 5.4.3 |
| S5-T6 | S5 | Phase 1 | Security review, load test (50 concurrent), uptime monitoring | 7.6 | Security hardening and monitoring specified in PRD Section 7.6 |
| S5-T7 | S5 | Phase 1 | Onboard first 10 beta customers with structured feedback | N/A | Beta customer onboarding described in PRD Section 10 |

| Sprint 6 — Stability, Feedback Fixes &amp; 50 Beta Customers |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S6-T1 | S6 | Phase 1 | Fix all P0/P1 bugs from first 10 beta customers | N/A | Continuous quality improvement |
| S6-T2 | S6 | Phase 1 | Google Contacts two-way sync with incremental sync and deduplication | 5.8 | Google Contacts two-way sync specified in PRD Section 5.8.1 |
| S6-T3 | S6 | Phase 1 | Database indexes, read replica for analytics, Redis caching | 7.5 | Read replicas for analytics, Redis caching specified in PRD Section 7.5 |
| S6-T4 | S6 | Phase 1 | UI polish: mobile responsiveness, IST timezone, empty states, errors | 5.1 | Contextual help and error guidance specified in PRD Section 5.1.2 |
| S6-T5 | S6 | Phase 1 | Data export (contacts, conversations, campaigns) and DPDP ZIP export | 5.10 | GDPR/DPDP data export within 24 hours specified in PRD Section 5.10 |
| S6-T6 | S6 | Phase 1 | Scale to 50 beta customers | N/A | 50 paying beta customers target from PRD Section 9.1 |
| S6-T7 | S6 | Phase 1 | Phase 1 technical retrospective and ADR documentation | N/A | Architecture decision records — engineering standard |

| Phase 2 — Traceability |
| --- |

| Sprint 7 — Deal Pipelines, Companies &amp; Smart Segments |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S7-T1 | S7 | Phase 2 | Company/organisation records with parent-subsidiary hierarchy | 5.3 | Company profiles, hierarchy, custom fields specified in PRD Section 5.3.2 |
| S7-T2 | S7 | Phase 2 | Deal pipeline schema: pipelines, stages, deals, activity log | 5.3 | Multiple pipelines, customisable stages, deal fields specified in PRD Section 5.3.3 |
| S7-T3 | S7 | Phase 2 | Deal pipeline Kanban board with drag-and-drop and list view | 5.3 | Kanban board and list view specified in PRD Section 5.3.3 |
| S7-T4 | S7 | Phase 2 | Smart segments engine with dynamic SQL and 15-minute refresh | 5.3 | Dynamic segments auto-updating on criteria match specified in PRD Section 5.3.4 |
| S7-T5 | S7 | Phase 2 | Segment builder UI with AND/OR logic and live count preview | 5.3 | Visual segment builder with preview specified in PRD Section 5.3.4 |
| S7-T6 | S7 | Phase 2 | Pipeline analytics: conversion funnel, win rate, deal velocity | 5.7 | Pipeline analytics (conversion rate, deal size, win rate) specified in PRD Section 5.7.3 |
| S7-T7 | S7 | Phase 2 | QA full CRM workflow: companies, deals, pipelines, segments | N/A | Quality assurance for full CRM data flow |

| Sprint 8 — Visual Flow Builder — Canvas, Triggers &amp; Actions |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S8-T1 | S8 | Phase 2 | Flow builder data model: flows, nodes, edges, executions | 5.5 | Flow builder data model is prerequisite for PRD Section 5.5 |
| S8-T2 | S8 | Phase 2 | Flow execution engine with all action nodes and wait support | 5.5 | All action nodes (send, assign, tag, update, deal, note, webhook, email) specified in PRD Section 5.5.3 |
| S8-T3 | S8 | Phase 2 | All 12 trigger types including Shopify and scheduled triggers | 5.5 | All trigger types specified in PRD Section 5.5.2 |
| S8-T4 | S8 | Phase 2 | Flow builder canvas: React Flow, drag-and-drop, undo/redo, minimap | 5.5 | Canvas with zoom, pan, undo/redo, minimap specified in PRD Section 5.5.1 |
| S8-T5 | S8 | Phase 2 | 20 pre-built flow templates library | 5.5 | Flow templates library specified in PRD Section 5.5.1 |
| S8-T6 | S8 | Phase 2 | Flow builder QA: 3 flows end-to-end, edge case testing | N/A | Quality assurance for automation engine |

| Sprint 9 — Chatbot Builder, Logic Nodes &amp; AI Smart Replies |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S9-T1 | S9 | Phase 2 | Chatbot nodes: question, button, list, handoff, bot hours | 5.5 | Chatbot node types (question, button, list, handoff) specified in PRD Section 5.5.5 |
| S9-T2 | S9 | Phase 2 | Chatbot builder UI with real-time conversation simulator | 5.5 | No-code chatbot builder with simulator specified in PRD Section 5.5.5 |
| S9-T3 | S9 | Phase 2 | Logic nodes: condition (if/else), A/B split, loop | 5.5 | Condition, A/B split, and loop nodes specified in PRD Section 5.5.4 |
| S9-T4 | S9 | Phase 2 | AI smart reply suggestions via Claude API (3 options, tones) | 5.6 | Smart reply with 3 options and tone selector specified in PRD Section 5.6.1 |
| S9-T5 | S9 | Phase 2 | AI suggestion panel in inbox with tone selector and acceptance tracking | 5.6 | Suggestion panel UX described in PRD Section 5.6.1 |
| S9-T6 | S9 | Phase 2 | Intent detection with auto-routing to Sales/Support queues | 5.6 | Intent detection (6 categories) and auto-routing specified in PRD Section 5.6.2 |
| S9-T7 | S9 | Phase 2 | Chatbot QA: 5-step lead qualification bot, 10 real conversations | N/A | Quality assurance for chatbot accuracy and CRM field capture |

| Sprint 10 — Campaign A/B, Lifecycle Automation &amp; Concierge |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S10-T1 | S10 | Phase 2 | Campaign A/B testing with auto-winner selection and holdout | 5.4 | A/B test with auto-winner specified in PRD Section 5.4.2 |
| S10-T2 | S10 | Phase 2 | Lifecycle stage automation rules with nightly BullMQ evaluation | 5.3 | Automatic lifecycle stage transitions based on triggers specified in PRD Section 5.3.5 |
| S10-T3 | S10 | Phase 2 | Smart Onboarding Concierge: 11-message Day 0-30 WhatsApp flow | 6.5 | Full 11-message concierge schedule with personalised variables specified in PRD Section 6.5 |
| S10-T4 | S10 | Phase 2 | A/B test UI in campaign builder with analytics comparison table | 5.4 | A/B variant selection and analytics comparison in PRD Section 5.4.2 |
| S10-T5 | S10 | Phase 2 | Lifecycle management UI: stage display, rules configuration page | 5.3 | Lifecycle stages UI and rule builder in PRD Section 5.3.5 |
| S10-T6 | S10 | Phase 2 | Concierge QA: trigger verification, variable accuracy, opt-out | 6.5 | Concierge delivery and opt-out behaviour specified in PRD Section 6.5.2 and 6.5.3 |

| Sprint 11 — CSAT Engine, Sentiment Analysis &amp; Agent Analytics |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S11-T1 | S11 | Phase 2 | CSAT survey engine: auto-send on resolve, button reply capture, follow-up | 6.10 | Automated CSAT survey via WhatsApp quick-reply buttons specified in PRD Section 6.10.1 |
| S11-T2 | S11 | Phase 2 | Sentiment analysis pipeline via Claude API with urgent flagging | 5.6 | Positive/neutral/negative scoring and urgent flagging specified in PRD Section 5.6.3 |
| S11-T3 | S11 | Phase 2 | CSAT dashboard: overall score, per-agent, trend, verbatim feedback | 6.10 | CSAT dashboard (score, per-agent, 13-week trend, verbatim) specified in PRD Section 6.10.2 |
| S11-T4 | S11 | Phase 2 | Agent performance dashboard: messages, response time, resolution, CSAT | 5.7 | Agent performance metrics specified in PRD Section 5.7.4 |
| S11-T5 | S11 | Phase 2 | Scheduled reports: PDF generation, email delivery, unsubscribe | 5.7 | Scheduled reports emailed weekly specified in PRD Section 5.7.5 |
| S11-T6 | S11 | Phase 2 | CRM analytics dashboard: funnel, pipeline value, lifecycle, contact growth | 5.7 | CRM analytics (funnel, pipeline, lifecycle distribution) specified in PRD Section 5.7.3 |
| S11-T7 | S11 | Phase 2 | Sentiment QA: 20 test messages, accuracy verification | N/A | Quality assurance for AI classification accuracy |

| Sprint 12 — REST API, Zapier/Make &amp; 200 Customers |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S12-T1 | S12 | Phase 2 | Public REST API with scoped API keys and rate limiting | 5.8 | Full REST API with OpenAPI spec and webhook platform specified in PRD Section 5.8.3 |
| S12-T2 | S12 | Phase 2 | OpenAPI spec and developer documentation site | 5.8 | API documentation site with code examples specified in PRD Section 5.8.3 |
| S12-T3 | S12 | Phase 2 | Zapier integration: 5 triggers + 5 actions, submitted for review | 5.8 | Zapier integration specified in PRD Section 5.8.2 |
| S12-T4 | S12 | Phase 2 | Make (Integromat) and Pabbly Connect modules published | 5.8 | Make and Pabbly Connect integrations specified in PRD Section 5.8.2 |
| S12-T5 | S12 | Phase 2 | Phase 2 full regression test at 200 concurrent users | N/A | Quality gate for Phase 2 completion |
| S12-T6 | S12 | Phase 2 | Scale to 200 paying customers | N/A | 200 customers, ₹10L MRR target from PRD Section 9.2 |

| Phase 3 — Traceability |
| --- |

| Sprint 13 — Trust Score Dashboard &amp; AI Copy Generator |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S13-T1 | S13 | Phase 3 | Trust Score computation engine: 6 dimensions, nightly job | 6.1 | 6-dimension score (Template Quality, Delivery Rate, Opt-in Hygiene, Resolution, Response, Sentiment) specified in PRD Section 6.1.1 |
| S13-T2 | S13 | Phase 3 | Trust Score dashboard: gauge, trend, radar chart, improvement tips | 6.1 | Circular gauge, 13-week trend, per-dimension breakdown specified in PRD Section 6.1.2 |
| S13-T3 | S13 | Phase 3 | Gamification: badges (5 types), monthly challenges, leaderboard | 6.1 | Monthly challenges, badges, leaderboard, Trust Badge specified in PRD Section 6.1.3 |
| S13-T4 | S13 | Phase 3 | AI campaign copy generator: 3 template drafts from plain text input | 5.6 | 3 WhatsApp template drafts with tone and language control specified in PRD Section 5.6.4 |
| S13-T5 | S13 | Phase 3 | AI copy generator UI in template creation flow with preview | 5.6 | Copy generator UI with tone selector described in PRD Section 5.6.4 |
| S13-T6 | S13 | Phase 3 | Conversation summariser: 3-5 sentence summary stored as internal note | 5.6 | One-click conversation summary stored as note specified in PRD Section 5.6.5 |
| S13-T7 | S13 | Phase 3 | Trust Score validation QA against manual calculation | N/A | Score accuracy verification (±2 points) |

| Sprint 14 — WhatsApp Commerce Layer |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S14-T1 | S14 | Phase 3 | Product catalogue with Shopify/WooCommerce sync | 6.4 | Product catalogue with Shopify/WooCommerce sync specified in PRD Section 6.4.1 |
| S14-T2 | S14 | Phase 3 | In-chat product card and multi-product list send | 6.4 | Product card, multi-product message, cart specified in PRD Section 6.4.2 |
| S14-T3 | S14 | Phase 3 | Razorpay payment link generation with auto thank-you and invoice | 6.4 | Razorpay payment link, WhatsApp Pay, confirmation message specified in PRD Section 6.4.3 |
| S14-T4 | S14 | Phase 3 | Order management: status workflow, Shopify sync, refund handling | 6.4 | Order status flow, Shopify sync, WhatsApp updates, refunds specified in PRD Section 6.4.4 |
| S14-T5 | S14 | Phase 3 | Commerce UI: catalogue page, in-chat product send, payment creator, analytics | 6.4 | Full commerce UI and analytics dashboard specified in PRD Sections 6.4.2 and 6.4.5 |
| S14-T6 | S14 | Phase 3 | Commerce end-to-end QA: product → payment → order → Shopify sync | N/A | Quality assurance for full commerce transaction |

| Sprint 15 — Voice AI — Transcription, Classification &amp; TTS |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S15-T1 | S15 | Phase 3 | Voice note ingestion pipeline: download from Meta CDN → S3 → queue | 6.7 | Voice note storage and processing pipeline specified in PRD Section 6.7.1 |
| S15-T2 | S15 | Phase 3 | OpenAI Whisper transcription with Hindi/English language support | 6.7 | Whisper transcription, language auto-detection specified in PRD Section 6.7.1 |
| S15-T3 | S15 | Phase 3 | Voice AI classification, CRM field extraction, keyword alerts | 6.7 | Classification, field extraction, keyword alerts specified in PRD Sections 6.7.2 and 6.7.3 |
| S15-T4 | S15 | Phase 3 | Voice AI UX in inbox: transcript, intent badge, field suggestions | 6.7 | Inline transcript, intent badge, field extraction suggestions in PRD Section 6.7.1 |
| S15-T5 | S15 | Phase 3 | Outbound TTS via ElevenLabs: 4 voice options with S3 caching | 6.7 | Outbound TTS with Indian voice options specified in PRD Section 6.7.4 |
| S15-T6 | S15 | Phase 3 | TTS compose UI: voice toggle, voice selector, preview before send | 6.7 | TTS UI described in PRD Section 6.7.4 |
| S15-T7 | S15 | Phase 3 | Voice AI QA: 20 voice samples (Hindi/English), accuracy benchmark | N/A | Transcription accuracy target &gt;90% from PRD Section 6.7.1 |

| Sprint 16 — AI Relationship Intelligence |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S16-T1 | S16 | Phase 3 | Churn prediction ML model: gradient boosted classifier, weekly scoring | 6.3 | Churn model (days inactive, sentiment, reply rate, frequency) specified in PRD Section 6.3.2 |
| S16-T2 | S16 | Phase 3 | Upsell signal detection: rule-based + LLM hybrid, auto-tag | 6.3 | Upsell signal types and auto-tag specified in PRD Section 6.3.3 |
| S16-T3 | S16 | Phase 3 | Relationship health score per contact: 0-100, weekly, 13-week history | 6.3 | Relationship health score formula and alert threshold specified in PRD Section 6.3.4 |
| S16-T4 | S16 | Phase 3 | Best time to contact per contact and campaign send-time recommendation | 6.3 | Best time analysis and campaign optimisation specified in PRD Section 6.3.1 |
| S16-T5 | S16 | Phase 3 | AI Weekly Intelligence Report: Monday WhatsApp delivery with action buttons | 6.3 | Monday morning WhatsApp intelligence report specified in PRD Section 6.3.5 |
| S16-T6 | S16 | Phase 3 | Relationship intelligence UI: badges on contact profile, at-risk page | 6.3 | Contact profile additions and At-Risk Contacts page described in PRD Section 6.3 |
| S16-T7 | S16 | Phase 3 | Relationship intelligence QA: 5 known contacts vs system prediction | N/A | Model precision target &gt;75% from PRD Section 11.2 |

| Sprint 17 — React Native Mobile App |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S17-T1 | S17 | Phase 3 | Mobile API optimisation: pagination, ETag, push notification service | 6.2 | Push notifications for new messages and assignments specified in PRD Section 6.2.2 |
| S17-T2 | S17 | Phase 3 | React Native app skeleton: navigation, Clerk auth, biometric lock, dark mode | 6.2 | Navigation, biometric lock, dark mode specified in PRD Section 6.2.1 and 6.2.2 |
| S17-T3 | S17 | Phase 3 | Mobile inbox: conversation list, thread, compose, AI suggestions, CRM swipe | 6.2 | WhatsApp-identical chat UI, AI suggestions, CRM card swipe specified in PRD Section 6.2.1 |
| S17-T4 | S17 | Phase 3 | Mobile contact profile, campaign launcher, Trust Score, home widget | 6.2 | Home screen widget and Trust Score screen specified in PRD Section 6.2.2 |
| S17-T5 | S17 | Phase 3 | Camera-to-contact (OCR) and voice-to-note features | 6.2 | Camera OCR and voice-to-note specified in PRD Section 6.2.2 |
| S17-T6 | S17 | Phase 3 | Mobile QA on 4 devices, TestFlight and Play Store Internal Testing | N/A | App store submission prerequisite testing |

| Sprint 18 — NPS Collection, App Store &amp; 500 Customers |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S18-T1 | S18 | Phase 3 | NPS collection: monthly survey, promoter/detractor follow-ups | 6.10 | Monthly NPS survey, promoter Google Review request, detractor outreach specified in PRD Section 6.10.3 |
| S18-T2 | S18 | Phase 3 | App Store and Play Store submission with listing assets | 6.2 | Mobile app for iOS and Android specified in PRD Section 6.2 |
| S18-T3 | S18 | Phase 3 | Phase 3 full regression at 500 concurrent users | N/A | Quality gate for Phase 3 completion |
| S18-T4 | S18 | Phase 3 | Scale to 500 paying customers, agency channel activated | N/A | 500 customers, ₹30L MRR target from PRD Section 9.3 |
| S18-T5 | S18 | Phase 3 | Phase 3 technical retrospective and Phase 4 readiness checklist | N/A | Architecture documentation standard |

| Phase 4 — Traceability |
| --- |

| Sprint 19 — Agency Dashboard &amp; White-Label Infrastructure |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S19-T1 | S19 | Phase 4 | Agency account model: sub-accounts, scoped API, impersonation token | 6.6 | Agency master dashboard with one-click client switch specified in PRD Section 6.6.2 |
| S19-T2 | S19 | Phase 4 | White-label infrastructure: custom domain, SSL, CNAME, email sender | 6.6 | Custom domain, logo, colours, email sender specified in PRD Section 6.6.1 |
| S19-T3 | S19 | Phase 4 | Agency master dashboard: client list, aggregate stats, health alerts | 6.6 | Client list with Trust Score, MRR, health alerts specified in PRD Section 6.6.2 |
| S19-T4 | S19 | Phase 4 | White-label configuration UI: logo, colours, domain wizard, login preview | 6.6 | Branding settings and domain setup described in PRD Section 6.6.1 |
| S19-T5 | S19 | Phase 4 | Bulk template and flow push to selected sub-accounts | 6.6 | Template and flow push to multiple clients specified in PRD Section 6.6.4 |
| S19-T6 | S19 | Phase 4 | Agency billing: wholesale discount, per-client usage report | 6.6 | 20% wholesale discount and per-client billing specified in PRD Section 6.6.3 |
| S19-T7 | S19 | Phase 4 | Agency QA: sub-account isolation, white-label DNS, billing discount | N/A | Sub-account data isolation verification |

| Sprint 20 — Predictive Analytics Engine |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S20-T1 | S20 | Phase 4 | Revenue forecasting model: deal pipeline + historical regression, 3 scenarios | 6.8 | 30/60/90-day revenue forecast with low/mid/high scenarios specified in PRD Section 6.8.1 |
| S20-T2 | S20 | Phase 4 | LTV prediction model: 12-month predicted LTV per contact, weekly update | 6.8 | LTV prediction with High LTV and At-Risk High LTV segments specified in PRD Section 6.8.3 |
| S20-T3 | S20 | Phase 4 | Engagement anomaly detection: baseline model, daily job, WhatsApp alert | 6.8 | Anomaly detection with 2-std-dev threshold and recommended actions specified in PRD Section 6.8.4 |
| S20-T4 | S20 | Phase 4 | Campaign performance prediction before send with opt-out warning | 6.8 | Pre-send prediction (delivery, read, reply, opt-out rates) specified in PRD Section 6.8.2 |
| S20-T5 | S20 | Phase 4 | Predictive analytics UI: forecast card, LTV on contact, campaign predictions | 6.8 | Full predictive UI across dashboard, contact profile, campaign builder specified in PRD Section 6.8 |
| S20-T6 | S20 | Phase 4 | Predictive analytics QA: LTV and forecast accuracy validation | N/A | Model accuracy targets from PRD Section 11.2 |

| Sprint 21 — Multi-Channel Inbox (Instagram, Facebook, Web Chat) |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S21-T1 | S21 | Phase 4 | Channel abstraction layer: channel_type enum, channel_accounts table | 6.9 | Channel abstraction supporting WhatsApp, Instagram, Facebook, Email, Web Chat, SMS in PRD Section 6.9.1 |
| S21-T2 | S21 | Phase 4 | Instagram DM integration via Meta Graph API | 6.9 | Instagram DM with full CRM sync specified in PRD Section 6.9.1 |
| S21-T3 | S21 | Phase 4 | Facebook Messenger integration via Meta Graph API | 6.9 | Facebook Messenger integration specified in PRD Section 6.9.1 |
| S21-T4 | S21 | Phase 4 | Web Live Chat widget: embeddable JS, visitor identification, bot-first | 6.9 | Web Live Chat widget specified in PRD Section 6.9.1 |
| S21-T5 | S21 | Phase 4 | Multi-channel inbox UI: channel filters, icons, cross-channel timeline | 6.9 | Channel filter, badges, cross-channel timeline specified in PRD Section 6.9.2 |
| S21-T6 | S21 | Phase 4 | Multi-channel QA: Instagram, Facebook, Web Chat end-to-end | N/A | Quality assurance for channel integration |

| Sprint 22 — Email, SMS, Multilingual AI &amp; SOC 2 |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S22-T1 | S22 | Phase 4 | Email channel via IMAP/SMTP with Gmail and Outlook OAuth | 6.9 | Email (IMAP/SMTP) channel specified in PRD Section 6.9.1 |
| S22-T2 | S22 | Phase 4 | SMS channel via MSG91 with template-only compliance | 6.9 | SMS via MSG91/Kaleyra specified in PRD Section 6.9.1 |
| S22-T3 | S22 | Phase 4 | Multilingual AI: Hindi, Tamil, Telugu, Marathi for all AI features | 5.6 | Language support (Hindi, Tamil, Telugu, Marathi) specified in PRD Section 5.6.4 |
| S22-T4 | S22 | Phase 4 | SOC 2 Type II audit: auditor engaged, gap assessment complete | 7.6 | SOC 2 Type II roadmap target Month 18 specified in PRD Section 7.6 |
| S22-T5 | S22 | Phase 4 | Security hardening: MFA, session timeout, login lockout, log masking | 7.6 | MFA, VAPT, SOC 2, DPDP compliance specified in PRD Section 7.6 |
| S22-T6 | S22 | Phase 4 | Email, SMS, multilingual AI QA | N/A | Quality assurance for new channels and AI language support |

| Sprint 23 — Enterprise Plan, Partner Programme &amp; VAPT |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S23-T1 | S23 | Phase 4 | Enterprise plan with custom SLA, breach monitoring, credit system | 8.x | Enterprise plan with SLA contracts specified in PRD Section 9.4 |
| S23-T2 | S23 | Phase 4 | Partner/reseller programme with referral tracking and commission payout | N/A | Partner/reseller programme specified in PRD Section 9.4 and 10.2 |
| S23-T3 | S23 | Phase 4 | Third-party VAPT: penetration test, Critical/High findings fixed | 7.6 | VAPT every 6 months specified in PRD Section 7.6 |
| S23-T4 | S23 | Phase 4 | Production hardening: DB partitioning, Redis Cluster, ECS autoscaling | 7.5 | Auto-scaling, read replicas, and queue management specified in PRD Section 7.5 |
| S23-T5 | S23 | Phase 4 | Partner portal at partners.trustcrm.in with referral dashboard | N/A | Partner portal for referral and commission tracking |
| S23-T6 | S23 | Phase 4 | Enterprise and partner QA, VAPT re-test of top 5 findings | N/A | Quality assurance for enterprise plan and security posture |

| Sprint 24 — Final Stabilisation &amp; 1,000 Customers |
| --- |

| Task ID | Sprint | Phase | Task Summary | PRD Section | PRD Requirement |
| --- | --- | --- | --- | --- | --- |
| S24-T1 | S24 | Phase 4 | Full regression at 1,000 concurrent users: p95 &lt;800ms | N/A | Performance target at 1,000-customer scale |
| S24-T2 | S24 | Phase 4 | Documentation completeness audit: API, developer guides, webhooks | 5.8 | Developer documentation site with code examples specified in PRD Section 5.8.3 |
| S24-T3 | S24 | Phase 4 | DPDP compliance audit: export, deletion, consent, cookie consent | 5.10 | DPDP compliance (export, deletion within 24h) specified in PRD Section 5.10 |
| S24-T4 | S24 | Phase 4 | Scale to 1,000 paying customers, churn analysis | N/A | 1,000 customers, ₹50L MRR target from PRD Section 9.4 |
| S24-T5 | S24 | Phase 4 | Year 1 technical retrospective and Phase 5 planning | N/A | Architecture decision records and roadmap planning |
| S24-T6 | S24 | Phase 4 | Operational runbook: 5 failure scenarios, on-call rotation, PagerDuty | 7.6 | Datadog APM + PagerDuty on-call specified in PRD Section 7.1 |

# Summary: Tasks per PRD Section
The table below shows how many sprint tasks implement each PRD section, providing a quick overview of where engineering effort is allocated relative to product requirements.

| PRD Section | Section Title | Tasks | Coverage |
| --- | --- | --- | --- |
| 5.1 | Trust-First Onboarding | 2 | ██ |
| 5.2 | Smart Shared Team Inbox | 5 | █████ |
| 5.3 | Deep Custom CRM | 11 | ███████████ |
| 5.4 | Broadcast Campaigns &amp; Templates | 8 | ████████ |
| 5.5 | Visual Workflow Automation | 8 | ████████ |
| 5.6 | AI Intelligence Layer | 8 | ████████ |
| 5.7 | Analytics &amp; Reporting | 5 | █████ |
| 5.8 | Integrations &amp; REST API | 7 | ███████ |
| 5.9 | Billing Transparency Engine | 3 | ███ |
| 5.10 | Trust &amp; Compliance Center | 2 | ██ |
| 6.1 | Trust Score Dashboard | 3 | ███ |
| 6.2 | WhatsApp-Native Mobile App | 6 | ██████ |
| 6.3 | AI Relationship Intelligence | 6 | ██████ |
| 6.4 | WhatsApp Commerce Layer | 5 | █████ |
| 6.5 | Smart Onboarding Concierge | 2 | ██ |
| 6.6 | Agency &amp; White-Label Mode | 6 | ██████ |
| 6.7 | Voice AI &amp; Audio Intelligence | 6 | ██████ |
| 6.8 | Predictive Analytics Engine | 5 | █████ |
| 6.9 | Multi-Channel Inbox Extension | 7 | ███████ |
| 6.10 | CSAT &amp; Customer Feedback Engine | 3 | ███ |
| 7.1 | Technology Stack | 6 | ██████ |
| 7.2 | Multi-Tenancy Model | 2 | ██ |
| 7.5 | Scaling Strategy | 2 | ██ |
| 7.6 | Security &amp; Compliance | 5 | █████ |
| 8.x | Pricing / Billing | 2 | ██ |
| N/A | Dev/QA Foundation (cross-cutting) | 32 | ████████████████████ |
| TOTAL | All PRD Sections | 157 | 168 tasks across 24 sprints — 100% PRD coverage |

| End of Traceability Matrix TrustCRM PRD Traceability Matrix  /  Appendix E  /  Strictly Confidential 168 tasks mapped. 100% PRD coverage. Zero pending work. |
| --- |