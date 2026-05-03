# WBMSG
# Risk Register
Identification, Scoring &amp; Mitigation — ISO 31000 / PMBOK 11
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Head of PMO / VP Engineering
## 1. Purpose
The Risk Register is the authoritative log of identified risks to the WBMSG programme. It captures likelihood, impact, current state, owner, mitigation, and target close-out for each risk. It is reviewed monthly by Engineering Leadership and re-scored at every phase exit.
## 2. Scoring Model
### 2.1 Likelihood (1-5)

| Score | Label | Definition |
| --- | --- | --- |
| 1 | Rare | &lt;5% chance in the next 6 months |
| 2 | Unlikely | 5-25% chance |
| 3 | Possible | 25-50% chance |
| 4 | Likely | 50-80% chance |
| 5 | Almost certain | &gt;80% chance |

### 2.2 Impact (1-5)

| Score | Label | Definition |
| --- | --- | --- |
| 1 | Negligible | Cosmetic; no schedule or budget effect |
| 2 | Minor | &lt;5% schedule or budget impact; no customer effect |
| 3 | Moderate | 5-15% impact; isolated customer effect |
| 4 | Major | 15-30% impact; multi-customer outage; mild reputational |
| 5 | Critical | &gt;30% impact; SOC 2 breach; data loss; existential |

### 2.3 Risk Score
- Risk Score = Likelihood × Impact (1–25).
- 1-4 Low (green); 5-9 Medium (yellow); 10-15 High (orange); 16-25 Critical (red).
- All Critical and High risks reviewed weekly; Medium monthly; Low quarterly.
## 3. Risk Register — Live
### 3.1 Strategic &amp; Market Risks

| ID | Risk | L | I | Score | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RSK-001 | Meta WhatsApp pricing increases mid-build, eroding gross margin | 3 | 4 | 12 High | CFO | Open |
| RSK-002 | Hyperscaler CRM (Salesforce/HubSpot) launches WhatsApp-first SMB tier | 2 | 5 | 10 High | CPO | Open |
| RSK-003 | Competitor (WATI/AiSensy) cuts price below WBMSG cost basis | 3 | 3 | 9 Medium | CPO | Open |
| RSK-004 | Series A funding delayed beyond Sprint 18 | 2 | 5 | 10 High | CEO | Open |
| RSK-005 | Design-partner cohort under-recruits (&lt; 60 of 100) | 2 | 3 | 6 Medium | Head of CS | Open |

### 3.2 Technology &amp; Architecture Risks

| ID | Risk | L | I | Score | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RSK-101 | Meta API breaking change forces rewrite of inbox path | 2 | 4 | 8 Medium | Backend Lead | Open |
| RSK-102 | AI hallucination causes brand or compliance incident at design partner | 3 | 4 | 12 High | AI Lead | Open |
| RSK-103 | Database hot-shard at scale (&gt;10K orgs on single primary) | 3 | 3 | 9 Medium | Platform Lead | Open |
| RSK-104 | Vendor lock-in (Supabase/Vercel) blocks Enterprise self-host option | 2 | 3 | 6 Medium | CTO | Open |
| RSK-105 | Webhook outbound storm crashes customer endpoint, blocked by us | 3 | 3 | 9 Medium | Platform Lead | Open |
| RSK-106 | OpenAI / Anthropic API outage blocks AI agent flows | 3 | 3 | 9 Medium | AI Lead | Open |

### 3.3 Security &amp; Compliance Risks

| ID | Risk | L | I | Score | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RSK-201 | DPDP Act rules tighten before GA, forcing data-residency rework | 3 | 4 | 12 High | Legal | Open |
| RSK-202 | SOC 2 Type II audit slips beyond Sprint 22 + 6 months | 2 | 5 | 10 High | VP Eng | Open |
| RSK-203 | Tenant isolation breach detected in pentest | 1 | 5 | 5 Medium | Security Lead | Open |
| RSK-204 | PII leak via verbose log line in production | 2 | 4 | 8 Medium | Backend Lead | Open |
| RSK-205 | Critical CVE in Node 22 / Next 15 / Postgres 16 missed beyond 7-day patch SLA | 2 | 4 | 8 Medium | Platform Lead | Open |
| RSK-206 | Compromised admin credentials exfiltrate customer data | 2 | 5 | 10 High | Security Lead | Open |

### 3.4 Delivery &amp; People Risks

| ID | Risk | L | I | Score | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RSK-301 | Engineering attrition &gt;12% in any rolling 6-month window | 3 | 4 | 12 High | VP Eng | Open |
| RSK-302 | Hiring slips behind plan; capacity falls below 7 SP/eng/sprint average | 3 | 3 | 9 Medium | VP Eng | Open |
| RSK-303 | Scope creep exceeds 10% of sprint capacity | 3 | 3 | 9 Medium | PMO | Open |
| RSK-304 | Key dependency between Frontend and AI pods causes Sprint slippage | 3 | 3 | 9 Medium | EM | Open |
| RSK-305 | QA bottleneck — automation lags feature velocity | 3 | 3 | 9 Medium | QA Lead | Open |

### 3.5 Operational &amp; Customer Risks

| ID | Risk | L | I | Score | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| RSK-401 | P1 incident in first 90 days post-GA (&gt;15 min outage) | 3 | 4 | 12 High | Head of SRE | Open |
| RSK-402 | Chargeback / payment failure rate &gt;5% | 2 | 3 | 6 Medium | Finance Ops | Open |
| RSK-403 | Onboarding wizard completion drops below 70% | 2 | 3 | 6 Medium | CPO | Open |
| RSK-404 | Logo churn exceeds 5% / month sustained | 2 | 4 | 8 Medium | Head of CS | Open |
| RSK-405 | Negative review surge on G2/Capterra after a missed roadmap promise | 2 | 3 | 6 Medium | CPO | Open |

## 4. Risk Treatment Detail
Each row below details the mitigation, contingency, and trigger for the High and Critical risks above.
### 4.1 RSK-001 — Meta WhatsApp pricing increases
- Mitigation: Explicit pass-through clause in pricing page and ToS; quarterly margin review.
- Contingency: If margin falls below 60%, raise list price within 30 days; grandfather existing plans for one renewal cycle.
- Trigger: Margin &lt; 65% for two consecutive months.
### 4.2 RSK-002 — Hyperscaler CRM enters segment
- Mitigation: Lock differentiation on transparent pricing, SMB UX, and agency mode (none of which hyperscalers replicate quickly).
- Contingency: Accelerate marketplace and Apps integrations to deepen moat.
- Trigger: Salesforce / HubSpot announce SMB WhatsApp tier.
### 4.3 RSK-102 — AI hallucination at design partner
- Mitigation: Mandatory hand-off intent, RAG with source citation, prompt guardrails, opt-out flag for high-risk verticals.
- Contingency: Pause AI agents for affected org; root-cause within 24 h; public post-mortem within 5 BD.
- Trigger: Any AI response flagged by customer as harmful or factually wrong.
### 4.4 RSK-201 — DPDP rule tightening
- Mitigation: Quarterly legal review with external counsel (Cyril Amarchand); architecture pre-built for data localisation.
- Contingency: Activate ap-south-2 read-replica as primary if cross-region restriction enacted.
- Trigger: MeitY publishes draft DPDP rules with material changes.
### 4.5 RSK-202 — SOC 2 Type II slip
- Mitigation: Vanta deployed Sprint 4; controls mapped from Sprint 6.
- Contingency: Run a Type I audit as interim evidence for enterprise prospects.
- Trigger: Any control with &gt;15 days non-conformance.
### 4.6 RSK-301 — Engineering attrition
- Mitigation: Top-quartile compensation, equity refresh at 12 months, defined growth ladder.
- Contingency: Pre-warmed bench of contractors; documented onboarding to halve ramp time.
- Trigger: 2 voluntary exits in any single sprint.
## 5. Closed / Retired Risks
None at v1.0 baseline.
## 6. Review Cadence &amp; Governance
- Monthly: Engineering Leadership reviews all Critical and High; updates score and status.
- Quarterly: PMO + Sponsor full review; adds new risks emerging from horizon scan.
- Phase Exit: Re-score every open risk; retire mitigated risks with sign-off.
- Annually: External risk-management audit (PwC) covering register completeness and treatment effectiveness.
## 7. Change Log

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | PMO | Baseline at end of Sprint 0 |

End of Risk Register | WBMSG v1.0 | April 2026 | ISO 31000 / PMBOK 11