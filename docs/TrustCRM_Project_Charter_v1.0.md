# WBMSG
# Project Charter
Authorisation, Scope, Stakeholders &amp; Success Criteria
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Executive Sponsor / CEO
## 1. Project Identification

| Field | Value |
| --- | --- |
| Project Name | WBMSG — WhatsApp-First CRM for SMBs |
| Project Code | TRUST-2026 |
| Charter Version | 1.0 |
| Charter Date | 26 April 2026 |
| Phase | Initiation → Execution (Sprint 0 complete) |
| Expected GA | Sprint 24 — March 2027 |
| Budget Authority | INR 14.6 Cr (CapEx + 12 mo OpEx) |
| Executive Sponsor | CEO |
| Project Director | VP Engineering |
| Product Owner | Chief Product Officer |

## 2. Business Case Summary
India has 64M+ MSMEs and 535M WhatsApp users — yet existing CRM tools either ignore WhatsApp as a first-class channel (Salesforce, HubSpot, Zoho) or focus on chat alone with surprise pricing and shallow CRM features (WATI, AiSensy, Interakt). WBMSG closes that gap with a transparent-pricing, AI-augmented, WhatsApp-first CRM purpose-built for the 1-50 employee segment, with white-label sub-account architecture for agencies.
### 2.1 Strategic Alignment
- Aligns to India's Digital MSME initiative and DPDP Act 2023 readiness mandate.
- Captures the SMB segment that hyperscaler CRMs cannot economically serve.
- Builds a defensible AI moat through proprietary conversation-flow data.
- Establishes a foundation for international expansion (SEA, MENA, LATAM) post-GA.
### 2.2 Expected Business Value (Year 1 post-GA)

| KPI | Target | Strategic Rationale |
| --- | --- | --- |
| Paying Accounts | 5,000 | Validates SMB product-market fit |
| ARR | INR 18 Cr | Threshold for Series A |
| WAB (North Star) | ≥ 75% | Proves daily active usage |
| NPS | ≥ 50 | Word-of-mouth growth in SMB segment |
| Gross Margin | ≥ 72% | SaaS-grade unit economics |
| Logo Churn | ≤ 4% / month | Industry benchmark for SMB SaaS |

## 3. Project Objectives
### 3.1 SMART Objectives
1. Ship GA-ready product spanning all 9 PRD modules by 31 March 2027 (24 sprints, 168 tasks).
1. Achieve SOC 2 Type II audit readiness by Sprint 22 (1 February 2027).
1. Onboard 100 design-partner customers by Sprint 12 (October 2026) with NPS ≥ 40.
1. Maintain p95 API latency ≤ 300 ms and 99.9% monthly uptime from Sprint 14 onwards.
1. Hold CAC ≤ INR 2,800 and 12-month LTV/CAC ≥ 3.5 measured at Month 12 post-GA.
### 3.2 Out of Scope (Explicit Exclusions)
- Voice channel (telephony / IVR) — deferred to v2.0 roadmap.
- Native iOS / Android apps — Progressive Web App in v1.0; native apps post-GA.
- On-premise / VPC deployment — multi-tenant SaaS only at GA.
- Industry-specific verticals (real-estate CRM, healthcare CRM) — horizontal product only.
- Email marketing automation beyond transactional — partnership integrations only.
- Direct hardware integration (POS, barcode scanners) — webhook-based only.
## 4. High-Level Scope
### 4.1 In-Scope Functional Capabilities (9 Modules)

| # | Module | Owner | Sprint Range |
| --- | --- | --- | --- |
| M1 | Authentication &amp; Multi-Tenancy | Backend Lead | S1-S3 |
| M2 | Contact &amp; Lead Management (CRM Core) | Backend Lead | S2-S6 |
| M3 | WhatsApp Inbox &amp; Conversations | Full-stack Lead | S4-S10 |
| M4 | Template &amp; Campaign Manager | Backend Lead | S7-S12 |
| M5 | AI Agents &amp; Automation Builder | AI Lead | S9-S16 |
| M6 | Analytics &amp; Reporting | Data Lead | S11-S18 |
| M7 | Billing &amp; Subscription | Backend Lead | S13-S17 |
| M8 | Agency / Sub-Account Mode | Platform Lead | S15-S20 |
| M9 | Marketplace &amp; Integrations | Platform Lead | S18-S24 |

### 4.2 Major Deliverables
- GA-quality web application (Next.js PWA) on app.WBMSG.in.
- Public REST + Webhook API on api.WBMSG.in/v1.
- Self-service signup, onboarding wizard, and live billing calculator.
- SOC 2 Type II report (audit window opens Sprint 22).
- DPDP Act 2023 compliance attestation.
- Public marketing site, status page, and developer documentation portal.
- Operational runbook, on-call rotation, and 24×7 P1 incident response.
## 5. Stakeholders (Summary — full RACI in dedicated matrix)

| Group | Stakeholder | Interest | Influence |
| --- | --- | --- | --- |
| Executive | CEO (Sponsor) | Strategic outcome, budget | High |
| Executive | CFO | Burn rate, unit economics | High |
| Executive | CPO | Product vision, roadmap | High |
| Executive | CTO / VP Eng | Architecture, delivery | High |
| Engineering | Backend / Frontend / AI / Platform Leads | Implementation | High |
| Quality | QA Lead | Quality gates, automation | Medium |
| GTM | Head of Marketing, Head of Sales | Launch readiness, CAC | Medium |
| GTM | Head of Customer Success | Onboarding, retention | Medium |
| External | Design-partner customers (100) | Early access, feedback | High |
| External | Meta WhatsApp BSP | Channel approval, throughput | High |
| External | Clerk, Stripe, OpenAI | Vendor SLAs | Medium |
| Regulator | MeitY (DPDP), GST authority | Compliance, taxation | Medium |
| Investor | Series Seed lead, advisors | Milestones, governance | High |

## 6. High-Level Milestones

| Milestone | Target Date | Exit Criteria |
| --- | --- | --- |
| Project kick-off | 20 April 2026 | Charter signed, team onboarded |
| Phase 1 — Foundation complete | 30 June 2026 | Auth, CRM core, WA inbox MVP live |
| Phase 2 — Growth Engine complete | 30 Sept 2026 | Templates, campaigns, AI v1 live |
| Design Partner GA | 15 Oct 2026 | 100 customers onboarded |
| Phase 3 — Intelligence complete | 31 Dec 2026 | Automations, analytics, billing live |
| Phase 4 — Scale &amp; Compliance complete | 28 Feb 2027 | Agency mode, marketplace, SOC 2 ready |
| Public GA Launch | 31 March 2027 | 5K paying accounts pipeline, 99.9% SLO held |

## 7. High-Level Budget

| Cost Category | Year 1 (INR) | Notes |
| --- | --- | --- |
| Engineering Salaries (24 FTE) | 8.40 Cr | Avg fully-loaded ₹35 L/yr |
| Cloud Infrastructure (AWS, Vercel, Supabase) | 1.20 Cr | Scales with WAB |
| 3rd-Party SaaS (Clerk, Stripe, Sentry, Datadog, etc.) | 0.45 Cr |  |
| Meta WhatsApp Conversation Charges (passthrough) | 1.80 Cr | Recovered in margin |
| AI Inference (OpenAI / Anthropic) | 0.85 Cr | Re-priced quarterly |
| Marketing &amp; Demand Gen | 1.50 Cr | CAC budget |
| Compliance &amp; Audit (SOC 2, DPDP, legal) | 0.30 Cr | External auditors |
| Contingency (~7%) | 0.10 Cr | Risk reserve |
| Total Year-1 Budget | 14.60 Cr |  |

## 8. Assumptions &amp; Constraints
### 8.1 Assumptions
- Meta will maintain WhatsApp Cloud API pricing within ±15% of April 2026 rates.
- INR/USD exchange rate stays within ±8% over 12 months.
- Hiring plan (24 FTE by Sprint 12) holds; no greater than 12% attrition.
- Clerk, Stripe, and Supabase remain available in India and stay within SLA.
- Series A close (Sprint 18) is contingent on hitting Phase 2 milestones, not hard-locked.
### 8.2 Constraints
- DPDP Act 2023 mandates data residency for Indian customers — all primary databases must be in ap-south-1.
- WhatsApp templates must clear Meta approval (24-48 hr) before broadcast — campaign cadence accommodates this.
- SOC 2 Type II requires a 6-month audit window; cannot accelerate beyond Sprint 22 + 6 months.
- GST e-invoicing is mandatory for invoices ≥ INR 5 Cr aggregate turnover.
- Engineering team capped at 24 FTE for Year 1 — scope must respect velocity ceiling (~7 SP / engineer / sprint).
## 9. High-Level Risks (Top 7 — full register in dedicated doc)

| Risk | Likelihood | Impact | Owner |
| --- | --- | --- | --- |
| Meta WhatsApp pricing shock | Medium | High | CFO |
| Slip on SOC 2 audit window | Low | High | VP Eng |
| DPDP rule changes mid-build | Medium | Medium | Legal |
| Key engineering attrition | Medium | High | VP Eng |
| AI accuracy / hallucination incidents | Medium | High | AI Lead |
| Design-partner cohort under-recruits | Medium | Medium | Head of CS |
| Series A funding delay | Low | Critical | CEO |

## 10. Authority of the Project Director
- Approve scope changes within ±10% of sprint capacity without re-charter.
- Re-allocate up to 15% of any line-item budget without CFO sign-off.
- Hire / replace engineering and QA roles within approved headcount plan.
- Engage tier-3 vendors (≤ INR 25 L annual contract) without procurement review.
- Pause or descope any module that breaches a Critical risk threshold.
Decisions exceeding the above thresholds escalate to the Executive Sponsor. All decisions are logged in the Decision Register (Confluence &gt; PMO &gt; Decisions).
## 11. Communication Cadence

| Forum | Audience | Cadence | Owner |
| --- | --- | --- | --- |
| Daily Stand-up | Engineering pod | Daily 10:00 IST, 15 min | EM |
| Sprint Review + Demo | All hands | Bi-weekly Friday, 60 min | PO |
| Sprint Retro | Pod | Bi-weekly Friday, 45 min | Scrum Master |
| Project Steering Committee | Sponsor + Directors | Bi-weekly Monday, 60 min | VP Eng |
| Executive Update | Board / Investors | Monthly | CEO |
| Customer Advisory Board | 10 design partners | Monthly | CPO |
| Risk Review | Leadership | Monthly | PMO |
| Incident Post-Mortem | Engineering + on-call | Within 5 BD of P1/P2 | On-call lead |

## 12. Acceptance Criteria for Project Closure
- All 9 modules in production at agreed SLO; release notes published.
- SOC 2 Type II report received and circulated to enterprise prospects.
- DPDP Act 2023 compliance attested; data-protection officer appointed.
- ≥ 5,000 paying accounts; ARR ≥ INR 18 Cr; NPS ≥ 50.
- Operational handover complete: runbook published, on-call established, SLA tracking live.
- All open Critical and High risks closed or transferred with sign-off from Sponsor.
- Project closure report and lessons-learned published in PMO archive.
## 13. Approvals

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| Executive Sponsor (CEO) | _____________ | _____________ | ____ / 04 / 2026 |
| Chief Financial Officer | _____________ | _____________ | ____ / 04 / 2026 |
| Chief Product Officer | _____________ | _____________ | ____ / 04 / 2026 |
| VP Engineering (Project Director) | _____________ | _____________ | ____ / 04 / 2026 |
| Head of PMO | _____________ | _____________ | ____ / 04 / 2026 |

End of Project Charter | WBMSG v1.0 | April 2026 | Strictly Confidential