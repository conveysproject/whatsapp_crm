# WBMSG
# Software Requirements Specification
IEEE 29148-2018 Conformant Requirements Specification
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Chief Product Officer / Lead Business Analyst
## 1. Introduction
### 1.1 Purpose
This SRS specifies the functional and interface requirements of the WBMSG platform release v1.0 (GA, March 2027). It is the authoritative requirements artefact derived from PRD v2.0 and is the contractual baseline for engineering, QA, and acceptance. Non-functional requirements are specified in the companion NFR Specification document.
### 1.2 Scope
Software Product: WBMSG — a multi-tenant SaaS CRM with WhatsApp as the primary engagement channel, AI-augmented automation, and white-label agency mode. The product is delivered as a Progressive Web App backed by a REST + Webhook API. Out of scope for v1.0: native mobile apps, voice/IVR, on-prem deployment.
### 1.3 Definitions, Acronyms, Abbreviations

| Term | Definition |
| --- | --- |
| Account / Tenant | An organisation paying for WBMSG; isolated by organization_id |
| Sub-account | A child tenant under an Agency parent (M8) |
| WAB | Weekly Active Business — the North Star metric |
| BSP | Business Solution Provider — Meta-approved WhatsApp partner |
| HSM | Highly Structured Message — pre-approved WhatsApp template |
| Conversation | A 24-hour Meta-billed customer-care or marketing window |
| RPS | Requests per second |
| WCAG | Web Content Accessibility Guidelines |
| RBAC | Role-Based Access Control |

### 1.4 References
- WBMSG PRD v2.0 (April 2026) — product requirements baseline
- WBMSG Technical Architecture v1.0 — system design
- Meta WhatsApp Cloud API v22.0 — channel contract
- IEEE 29148-2018 — Systems and software engineering — Life cycle processes — Requirements engineering
- ISO/IEC 25010:2011 — Systems and software Quality Requirements and Evaluation
### 1.5 Document Conventions
- Each requirement carries a unique ID: SRS-&lt;module&gt;-&lt;n&gt;, e.g., SRS-AUTH-001.
- Modal verbs follow RFC 2119 — MUST is a hard requirement; SHOULD is a strong recommendation; MAY is optional.
- Acceptance criteria are expressed in Given-When-Then form where applicable.
- Each requirement is traceable to a PRD section and at least one test case (see PRD Traceability Matrix).
## 2. Overall Description
### 2.1 Product Perspective
WBMSG is a new, self-contained product. It depends on the following external systems via documented contracts: Meta WhatsApp Cloud API (messaging), Clerk (authentication), Stripe + Razorpay (billing), OpenAI/Anthropic (AI inference), Supabase Postgres (data), and AWS ap-south-1 (compute, storage, network).
### 2.2 Product Functions (Module Map)
- M1 Authentication &amp; Multi-Tenancy
- M2 Contact &amp; Lead Management
- M3 WhatsApp Inbox &amp; Conversations
- M4 Template &amp; Campaign Manager
- M5 AI Agents &amp; Automation Builder
- M6 Analytics &amp; Reporting
- M7 Billing &amp; Subscription
- M8 Agency / Sub-Account Mode
- M9 Marketplace &amp; Integrations
### 2.3 User Classes &amp; Characteristics

| User Class | Description | Privilege Level |
| --- | --- | --- |
| Owner | Account creator; full admin + billing | Highest |
| Admin | Full functional admin; no billing access | High |
| Manager | Team-level admin; can assign and report | Medium |
| Agent | Day-to-day inbox user; no admin actions | Low |
| Viewer | Read-only — typically auditor or analyst | Lowest |
| Agency Owner | Can create + manage child sub-accounts (M8) | Special |
| End-Customer | Receives WhatsApp messages — no app access | External |

### 2.4 Operating Environment
- Server-side: Node.js 22 LTS on Vercel + AWS Lambda (ap-south-1).
- Database: PostgreSQL 16 on Supabase Managed (ap-south-1, with read-replica in ap-south-2).
- Client-side: any modern browser (Chrome 120+, Safari 17+, Firefox 120+, Edge 120+); Android Chrome / iOS Safari for PWA.
- Minimum client connectivity: 1 Mbps; offline draft support for inbox replies.
### 2.5 Design and Implementation Constraints
- Indian customer data MUST reside in ap-south-1 (DPDP Act 2023).
- All endpoints MUST enforce tenant isolation by organization_id.
- All passwords MUST flow through Clerk; in-app password storage is prohibited.
- AI prompts MUST be version-controlled and never accept raw user PII without redaction.
- Frontend MUST conform to WCAG 2.1 AA.
### 2.6 Assumptions and Dependencies
- Meta Cloud API remains backwards-compatible within v22.0 family for the contract term.
- Clerk SLA ≥ 99.95% for India region.
- Supabase ap-south-1 capacity remains available throughout the build phase.
- Customer's WhatsApp Business Account is approved by Meta before onboarding completes.
## 3. Specific Requirements
### 3.1 Module M1 — Authentication &amp; Multi-Tenancy

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-AUTH-001 | The system MUST authenticate users via Clerk OAuth (Google, Apple, email/password). | Must | PRD §6.1 |
| SRS-AUTH-002 | The system MUST issue JWTs with claims {sub, org_id, role, exp ≤ 1h}. | Must | PRD §6.1.2 |
| SRS-AUTH-003 | The system MUST enforce TOTP-based MFA for Owner and Admin roles. | Must | PRD §6.1.3 |
| SRS-AUTH-004 | The system MUST support SSO via SAML 2.0 for Enterprise plan tenants. | Should | PRD §6.1.4 |
| SRS-AUTH-005 | The system MUST isolate every query by organization_id at the ORM layer. | Must | PRD §6.1.5 |
| SRS-AUTH-006 | The system MUST log every authentication event with IP, UA, timestamp, outcome. | Must | PRD §6.1.6 |
| SRS-AUTH-007 | The system MUST allow account Owners to invite up to N additional users where N is plan-defined. | Must | PRD §6.1.7 |
| SRS-AUTH-008 | The system MUST support session revocation (logout-all) per user from the security settings page. | Must | PRD §6.1.8 |

Acceptance Example — SRS-AUTH-005
GIVEN  a user signed in to org_A with JWT.org_id = "org_A"WHEN   the user issues GET /v1/contacts/ctc_belonging_to_org_BTHEN   the API returns HTTP 403 with code TENANT_MISMATCHAND    no row from org_B is leaked in the response body or logs
### 3.2 Module M2 — Contact &amp; Lead Management

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-CRM-001 | The system MUST allow CRUD on Contact with fields {phone E.164, name, email, tags[], custom_fields jsonb}. | Must | PRD §6.2.1 |
| SRS-CRM-002 | The system MUST de-duplicate contacts on phone (E.164) within an organisation. | Must | PRD §6.2.2 |
| SRS-CRM-003 | The system MUST allow bulk import via CSV up to 50,000 rows per file. | Must | PRD §6.2.3 |
| SRS-CRM-004 | The system MUST validate phone numbers via libphonenumber and reject invalid ones with row-level errors. | Must | PRD §6.2.3 |
| SRS-CRM-005 | The system MUST track Lead lifecycle stages {new, qualified, contacted, won, lost} with timestamped transitions. | Must | PRD §6.2.4 |
| SRS-CRM-006 | The system MUST support Pipelines with custom stages per pipeline (max 12 stages). | Must | PRD §6.2.5 |
| SRS-CRM-007 | The system MUST log every field change to a contact in an immutable activity_log table. | Must | PRD §6.2.6 |
| SRS-CRM-008 | The system MUST support contact segmentation by tag, custom field, last interaction, and lifecycle stage. | Must | PRD §6.2.7 |
| SRS-CRM-009 | The system MUST export segments to CSV up to 100,000 rows or stream beyond via signed URL. | Should | PRD §6.2.8 |

### 3.3 Module M3 — WhatsApp Inbox &amp; Conversations

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-INBOX-001 | The system MUST display inbound WhatsApp messages within 3 seconds of webhook receipt. | Must | PRD §6.3.1 |
| SRS-INBOX-002 | The system MUST support text, image, video, audio, document, sticker, location, contact, and interactive (button/list) message types. | Must | PRD §6.3.2 |
| SRS-INBOX-003 | The system MUST surface a per-conversation 24-hour customer-care window indicator. | Must | PRD §6.3.3 |
| SRS-INBOX-004 | The system MUST allow agent assignment, transfer, and snooze on a conversation. | Must | PRD §6.3.4 |
| SRS-INBOX-005 | The system MUST support canned replies, internal notes, and @mentions. | Must | PRD §6.3.5 |
| SRS-INBOX-006 | The system MUST persist read-receipts and typing indicators where Meta supplies them. | Must | PRD §6.3.6 |
| SRS-INBOX-007 | The system MUST queue outbound messages for retry on Meta 5xx with exponential backoff (max 5 retries). | Must | PRD §6.3.7 |
| SRS-INBOX-008 | The system MUST attach the conversation to the matching Contact, creating one if none exists. | Must | PRD §6.3.8 |

### 3.4 Module M4 — Template &amp; Campaign Manager

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-TMPL-001 | The system MUST submit templates to Meta for approval and surface status (pending/approved/rejected) within 1 minute of Meta state change. | Must | PRD §6.4.1 |
| SRS-TMPL-002 | The system MUST support marketing, utility, authentication, and service template categories. | Must | PRD §6.4.2 |
| SRS-TMPL-003 | The system MUST support Campaign creation with audience selection, template binding, scheduling, and throttling controls. | Must | PRD §6.4.3 |
| SRS-TMPL-004 | The system MUST honour per-account daily messaging limits set by Meta. | Must | PRD §6.4.4 |
| SRS-TMPL-005 | The system MUST report per-campaign sent / delivered / read / replied / failed counts in real time. | Must | PRD §6.4.5 |
| SRS-TMPL-006 | The system MUST support A/B split campaigns with statistical-significance reporting at conclusion. | Should | PRD §6.4.6 |
| SRS-TMPL-007 | The system MUST allow campaign cancellation while in flight, with reconciliation of counts within 60 seconds. | Must | PRD §6.4.7 |

### 3.5 Module M5 — AI Agents &amp; Automation Builder

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-AI-001 | The system MUST provide a no-code visual builder to compose conversation flows with trigger, condition, action, and AI-step blocks. | Must | PRD §6.5.1 |
| SRS-AI-002 | The system MUST execute AI replies via a configurable model (default GPT-4o-mini) with org-tenant prompt isolation. | Must | PRD §6.5.2 |
| SRS-AI-003 | The system MUST allow Knowledge-Base attachment (PDF, URL, FAQ) for retrieval-augmented generation per agent. | Must | PRD §6.5.3 |
| SRS-AI-004 | The system MUST detect agent hand-off intents and route to a human queue. | Must | PRD §6.5.4 |
| SRS-AI-005 | The system MUST log every AI response with prompt, model, tokens, latency, and customer message ID. | Must | PRD §6.5.5 |
| SRS-AI-006 | The system MUST cap AI inference spend per organisation per day per plan tier. | Must | PRD §6.5.6 |
| SRS-AI-007 | The system MUST allow flow simulation in a sandbox with synthetic conversations before publishing. | Should | PRD §6.5.7 |

### 3.6 Module M6 — Analytics &amp; Reporting

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-RPT-001 | The system MUST present a real-time dashboard with conversation volume, response time, agent load, and campaign performance. | Must | PRD §6.6.1 |
| SRS-RPT-002 | The system MUST allow date-range, segment, agent, and campaign filtering on every report. | Must | PRD §6.6.2 |
| SRS-RPT-003 | The system MUST allow scheduled email exports of any report (daily/weekly/monthly). | Must | PRD §6.6.3 |
| SRS-RPT-004 | The system MUST expose a read-only SQL view (Pro+ tiers) for custom BI tools (Metabase, Looker). | Should | PRD §6.6.4 |
| SRS-RPT-005 | The system MUST display conversation cost (Meta + AI) per campaign and per agent. | Must | PRD §6.6.5 |

### 3.7 Module M7 — Billing &amp; Subscription

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-BILL-001 | The system MUST present a live billing calculator that shows projected month-end charges in real time. | Must | PRD §6.7.1 |
| SRS-BILL-002 | The system MUST process subscriptions via Stripe (international) and Razorpay (India). | Must | PRD §6.7.2 |
| SRS-BILL-003 | The system MUST issue GST-compliant tax invoices within 24 h of payment. | Must | PRD §6.7.3 |
| SRS-BILL-004 | The system MUST issue an alert when projected month-end spend reaches 80% / 100% / 120% of a configured budget. | Must | PRD §6.7.4 |
| SRS-BILL-005 | The system MUST allow plan upgrade with prorated charge and downgrade at next cycle. | Must | PRD §6.7.5 |
| SRS-BILL-006 | The system MUST gracefully degrade to read-only when payment is overdue ≥ 7 days, with prior notification. | Must | PRD §6.7.6 |

### 3.8 Module M8 — Agency / Sub-Account Mode

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-AGNC-001 | The system MUST allow an Agency parent to create and manage child sub-accounts. | Must | PRD §6.8.1 |
| SRS-AGNC-002 | The system MUST enforce data isolation between sub-accounts (no cross-tenant reads). | Must | PRD §6.8.2 |
| SRS-AGNC-003 | The system MUST allow per-sub-account branding (logo, primary colour, custom domain CNAME). | Should | PRD §6.8.3 |
| SRS-AGNC-004 | The system MUST roll up usage and billing to the Agency at the master invoice level. | Must | PRD §6.8.4 |
| SRS-AGNC-005 | The system MUST allow the Agency to set per-sub-account markup on usage charges. | Must | PRD §6.8.5 |

### 3.9 Module M9 — Marketplace &amp; Integrations

| ID | Requirement | Priority | PRD Ref |
| --- | --- | --- | --- |
| SRS-INTG-001 | The system MUST provide native integrations with Shopify, WooCommerce, Razorpay, Zapier, Make, and Google Sheets. | Must | PRD §6.9.1 |
| SRS-INTG-002 | The system MUST expose webhook subscriptions for message.received, message.status, contact.created, lead.stage_changed. | Must | PRD §6.9.2 |
| SRS-INTG-003 | The system MUST sign every outbound webhook with HMAC-SHA256. | Must | PRD §6.9.3 |
| SRS-INTG-004 | The system MUST provide an OAuth 2.0 Server endpoint for third-party developers. | Should | PRD §6.9.4 |
| SRS-INTG-005 | The system MUST support a public app marketplace (post-GA — partial in v1.0). | May | PRD §6.9.5 |

## 4. External Interface Requirements
### 4.1 User Interfaces
- Web app (Next.js 15 App Router PWA) — installable on Android Home Screen and iOS Add-to-Home.
- Conform to WBMSG Design System v1.0 (separate document).
- WCAG 2.1 AA conformance MUST be measurable via Lighthouse and axe-core.
- Mobile-first; minimum supported viewport 360 × 640.
### 4.2 Hardware Interfaces — N/A (browser-based).
### 4.3 Software Interfaces

| Interface | Protocol | Owner |
| --- | --- | --- |
| Meta WhatsApp Cloud API v22.0 | HTTPS REST + Webhooks | Meta |
| Clerk Auth | OIDC | Clerk |
| Stripe + Razorpay | HTTPS REST + Webhooks | Stripe / Razorpay |
| OpenAI / Anthropic | HTTPS REST | OpenAI / Anthropic |
| Sentry / Datadog / PostHog | HTTPS REST | Vendors |
| Supabase Postgres | TLS 1.3 / Pgwire | Supabase |

### 4.4 Communications Interfaces
- All client-server traffic MUST be HTTPS with TLS 1.3.
- Webhook outbound traffic MUST allow customer IP allow-listing on request.
- WebSocket fallback to long-poll for the inbox real-time channel.
## 5. Verification Approach
- Each requirement maps to ≥ 1 test case in the Test Strategy document.
- Acceptance criteria written in Given-When-Then are automated where executable.
- Verification methods: T (Test), I (Inspection), A (Analysis), D (Demonstration).
- Requirement coverage gate: 100% of MUST, ≥ 90% of SHOULD verified by GA.
## 6. Requirement Volatility &amp; Change Control
- Requirements baseline frozen at end of Sprint 0; thereafter changes flow via Change &amp; Release Management Plan.
- Each change request gets impact assessment (cost / schedule / risk) before approval.
- Approved changes generate a new SRS minor version (v1.1, v1.2, …) and update the Traceability Matrix.
End of SRS | WBMSG v1.0 | April 2026 | Strictly Confidential | IEEE 29148-2018 conformant