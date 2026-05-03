# WBMSG
# RACI &amp; Stakeholder Matrix
Roles, Accountability and Stakeholder Engagement Plan
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Head of PMO
## 1. Purpose
This matrix establishes who is Responsible, Accountable, Consulted, and Informed (RACI) for every cross-functional decision and deliverable in the WBMSG programme. It is the source of truth for escalation paths, decision rights, and stakeholder engagement frequency.
## 2. Legend
- R — Responsible: does the work (can be more than one).
- A — Accountable: signs off; only one per row.
- C — Consulted: provides input before decision (two-way).
- I — Informed: kept up to date after decision (one-way).
- Blank — no role.
## 3. Role Glossary

| Role | Holder (April 2026) | Reports To |
| --- | --- | --- |
| CEO | Executive Sponsor | Board |
| CFO | Finance Lead | CEO |
| CPO | Chief Product Officer | CEO |
| CTO/VPE | VP Engineering / CTO (Project Director) | CEO |
| EM | Engineering Manager | VPE |
| TL-BE | Backend Tech Lead | EM |
| TL-FE | Frontend Tech Lead | EM |
| TL-AI | AI Tech Lead | EM |
| TL-PLT | Platform/SRE Lead | EM |
| QAL | QA Lead | VPE |
| SEC | Security Lead | CTO |
| DPO | Data Protection Officer | Legal |
| LGL | Legal Counsel | CEO |
| DSGN | Design Lead | CPO |
| PO | Product Owner (per pod) | CPO |
| BA | Business Analyst | CPO |
| PMO | PMO Head | VPE |
| MKT | Head of Marketing | CEO |
| SAL | Head of Sales | CEO |
| CS | Head of Customer Success | CEO |
| FOPS | Finance Operations | CFO |
| HR | People / HR | CEO |

## 4. Programme-Level RACI
### 4.1 Strategy &amp; Charter

| Decision / Artefact | CEO | CPO | VPE | CFO | PMO |
| --- | --- | --- | --- | --- | --- |
| Project Charter | A | C | C | C | R |
| Annual Roadmap (themes) | A | R | C | C | I |
| Quarterly OKR set | A | R | R | C | C |
| Series A go-to-market plan | A | C | C | R | I |
| Pricing strategy | A | R | I | C | I |

### 4.2 Product Definition

| Decision / Artefact | CPO | PO | VPE | DSGN | BA |
| --- | --- | --- | --- | --- | --- |
| PRD ownership | A | R | C | C | R |
| SRS ownership | C | C | I | I | A/R |
| Persona research | A | C | I | C | R |
| Backlog grooming | C | A/R | R | C | C |
| Sprint priorities | C | A/R | C | I | I |
| Feature acceptance | C | A/R | C | C | C |

### 4.3 Engineering Delivery

| Decision / Artefact | VPE | EM | TL-* | QAL | PMO |
| --- | --- | --- | --- | --- | --- |
| Architecture decisions (ADRs) | A | C | R | I | I |
| Sprint plan &amp; velocity | C | A | R | C | I |
| Definition of Done | A | R | R | R | I |
| Code review enforcement | I | A | R | C | I |
| Release sign-off | A | R | C | R | I |
| Hotfix deploy | A | R | R | C | I |
| Tech-debt prioritisation | A | R | R | C | C |

### 4.4 Quality &amp; Test

| Decision / Artefact | QAL | EM | TL-* | PO | VPE |
| --- | --- | --- | --- | --- | --- |
| Test Strategy ownership | A/R | C | C | C | I |
| Coverage gates in CI | A | R | R | I | I |
| UAT coordination with design partners | R | C | I | A | I |
| Performance test execution | A | R | R | I | I |
| Penetration test coordination | C | C | C | I | I |
| Bug triage | A/R | R | R | C | I |

### 4.5 Security, Privacy &amp; Compliance

| Decision / Artefact | SEC | DPO | LGL | VPE | CEO |
| --- | --- | --- | --- | --- | --- |
| Information Security Policy | A/R | C | C | C | I |
| Data Privacy &amp; DPDP Policy | C | A/R | R | I | I |
| SOC 2 audit engagement | A | C | C | R | I |
| Security incident response (P1) | A/R | C | C | R | I |
| Pentest scope &amp; remediation | A/R | I | C | C | I |
| Data Subject Access Request (DSAR) handling | C | A/R | C | I | I |
| Vendor security review | A/R | C | C | C | I |
| Privacy Impact Assessment (PIA) | C | A/R | R | I | I |

### 4.6 Operations &amp; Incident

| Decision / Artefact | TL-PLT | EM | VPE | CS | CEO |
| --- | --- | --- | --- | --- | --- |
| On-call rotation | A/R | R | I | I | I |
| Runbook ownership | A/R | C | I | I | I |
| P1 incident commander | A/R | C | C | I | I |
| Customer comms on P1 | C | C | C | A/R | I |
| Public post-mortem publication | R | C | A | C | I |
| SLO breach decision (credit issuance) | C | C | A | R | I |

### 4.7 Go-to-Market &amp; Customer

| Decision / Artefact | MKT | SAL | CS | CPO | CEO |
| --- | --- | --- | --- | --- | --- |
| Launch plan (GA) | A/R | R | R | C | I |
| Pricing page changes | R | C | C | A | I |
| Design-partner programme | C | R | A/R | C | I |
| Customer Advisory Board | I | C | A/R | C | I |
| NPS programme | C | C | A/R | I | I |
| Public roadmap | C | C | C | A/R | I |
| Partnership signing (BSP, ISVs) | C | C | C | C | A |

### 4.8 Finance &amp; Commercial

| Decision / Artefact | CFO | FOPS | CEO | VPE | PMO |
| --- | --- | --- | --- | --- | --- |
| Annual budget | A/R | R | I | C | C |
| Vendor contracts &gt; INR 25 L | A/R | R | C | C | I |
| Reseller contracts (agencies) | C | R | A | I | I |
| Refund / credit issuance &gt;INR 50K | A/R | R | I | I | I |
| Tax invoice issuance | A | R | I | I | I |

## 5. Stakeholder Engagement Plan
### 5.1 Internal

| Stakeholder | Engagement Forum | Cadence | Owner |
| --- | --- | --- | --- |
| Board / Investors | Board update + KPI deck | Monthly | CEO |
| Executive Team | Steering Committee | Bi-weekly | VPE |
| All Hands | Town hall + roadmap demo | Monthly | CPO |
| Engineering pods | Stand-up + Sprint events | Daily / Bi-weekly | EM |
| GTM team | Pipeline review | Weekly | SAL |
| CS team | Health-score review | Weekly | CS |

### 5.2 External

| Stakeholder | Engagement Forum | Cadence | Owner |
| --- | --- | --- | --- |
| Design partners (100) | Customer Advisory Board call | Monthly | CS |
| BSP partner (Meta) | Account review | Quarterly | CTO |
| Auditor (SOC 2) | Control walkthrough | Quarterly during audit | SEC |
| Vendors (Stripe, Clerk, OpenAI) | QBR | Quarterly | CTO |
| Regulator (MeitY/DPDP) | Filing + DPO disclosure | As required | DPO |
| Press / Analysts | Briefing | Per launch milestone | MKT |
| Community (Discord, GitHub) | Office hours | Bi-weekly | DevRel |

## 6. Escalation Path
1. Level 1 — Engineering pod: EM resolves within 1 working day.
1. Level 2 — VPE / CPO: cross-pod or scope dispute, resolved within 3 working days.
1. Level 3 — Steering Committee: budget, schedule &gt;5%, or strategic dispute, resolved at next bi-weekly.
1. Level 4 — CEO / Board: existential, regulatory, or &gt;10% scope/budget, resolved within 5 working days.
## 7. Decision Log Reference
- All decisions captured in this matrix are logged in the Decision Register (Confluence &gt; PMO &gt; Decisions).
- Each entry: ID, date, decision, rationale, alternatives considered, accountable role, reviewers.
- Decisions involving privacy or security are mirrored to the Security Decision Log (separate page) by DPO/SEC.
## 8. Review Cadence
- Quarterly review by PMO; sign-off by VPE.
- Re-baselined at every phase exit and on org-chart changes.
- All open decisions older than 30 days flagged for closure at the next Steering Committee.
End of RACI &amp; Stakeholder Matrix | WBMSG v1.0 | April 2026 | PMBOK 13