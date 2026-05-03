# WBMSG
# Documentation Package — Index
Master Index of all WBMSG Project Documentation
Version 1.1  |  April 2026
Strictly Confidential
Document Owner
VP Engineering / PMO
## 1. About This Index
This is the master index of every formally-controlled document in the WBMSG project. It is the entry point for new team members, auditors, and stakeholders. v1.1 supersedes v1.0 and adds 16 documents authored at the close of Sprint 0 to align the project with PMBOK 7, IEEE 12207, ISO/IEC 25010, ISO/IEC 27001:2022, ISO 22301, ISO 31000, ITIL 4, SOC 2 Common Criteria, and SWEBOK.
Each entry below lists the document title, owning role, version, and the industry standard it conforms to (where applicable). Files are stored in the project root at e:\Product\WhatsApp_CRM\.
## 2. Change from v1.0 to v1.1
- Added 16 new documents covering governance, risk, security, privacy, operations, engineering standards, design, and end-user docs.
- Re-grouped documents into 8 themed clusters (§4) for navigability.
- Added Owner column to make accountability explicit.
- Added a Standard column to map every document to its conformance frame.
- Cross-reference matrix added (§5) to show which documents cite which.
## 3. Document Count Summary

| Cluster | Documents | Pages (approx) |
| --- | --- | --- |
| 1. Strategic &amp; Programme | 3 | 60 |
| 2. Product Requirements | 4 | 180 |
| 3. Architecture &amp; Engineering | 5 | 200 |
| 4. Quality &amp; Test | 1 | 60 |
| 5. Security, Privacy &amp; Risk | 4 | 120 |
| 6. Operations &amp; Reliability | 4 | 100 |
| 7. Design &amp; End-User | 2 | 60 |
| 8. Governance &amp; Index | 2 | 30 |
| Total | 25 | ≈ 810 |

## 4. Master Index
### 4.1 Cluster 1 — Strategic &amp; Programme

| # | Document | Owner | Version | Standard |
| --- | --- | --- | --- | --- |
| 01 | Project Charter | PMO / CEO | 1.0 | PMBOK 7 §4 |
| 02 | RACI &amp; Stakeholder Matrix | PMO Head | 1.0 | PMBOK 7 §13 |
| 03 | Sprint Execution Plan | VP Engineering / EMs | 1.0 | Scrum Guide 2020 |

### 4.2 Cluster 2 — Product Requirements

| # | Document | Owner | Version | Standard |
| --- | --- | --- | --- | --- |
| 04 | Product Requirements Document (PRD) | Chief Product Officer | 2.0 | Internal product spec |
| 05 | Software Requirements Specification (SRS) | Business Analyst / VPE | 1.0 | IEEE 29148:2018 |
| 06 | Non-Functional Requirements (NFR) | VP Engineering / QA Lead | 1.0 | ISO/IEC 25010:2011 |
| 07 | PRD Traceability Matrix | PMO / Business Analyst | 1.0 | Internal traceability |

### 4.3 Cluster 3 — Architecture &amp; Engineering

| # | Document | Owner | Version | Standard |
| --- | --- | --- | --- | --- |
| 08 | Technical Architecture | CTO / Tech Leads | 1.0 | TOGAF-aligned |
| 09 | API Specification | Backend Tech Lead | 1.0 | OpenAPI 3.1 |
| 10 | Database Schema | Backend Tech Lead | 1.0 | PostgreSQL 16 conventions |
| 11 | ADR Index + 8 Baseline ADRs | Tech Leads / VPE | 1.0 | Michael Nygard ADR pattern |
| 12 | Coding Standards &amp; Best Practices | VP Engineering | 1.0 | SWEBOK Guide v3 |

### 4.4 Cluster 4 — Quality &amp; Test

| # | Document | Owner | Version | Standard |
| --- | --- | --- | --- | --- |
| 13 | Test Strategy | QA Lead | 1.0 | ISTQB / IEEE 829 |

### 4.5 Cluster 5 — Security, Privacy &amp; Risk

| # | Document | Owner | Version | Standard |
| --- | --- | --- | --- | --- |
| 14 | Information Security Policy | Security Lead / CISO | 1.0 | ISO/IEC 27001:2022 + SOC 2 CC |
| 15 | Data Privacy &amp; DPDP Compliance Policy | Data Protection Officer | 1.0 | DPDP Act 2023 + GDPR |
| 16 | Risk Register | PMO / VP Engineering | 1.0 | ISO 31000 + PMBOK 7 §11 |
| 17 | Disaster Recovery &amp; Business Continuity Plan | Platform Lead / SRE | 1.0 | ISO 22301:2019 |

### 4.6 Cluster 6 — Operations &amp; Reliability

| # | Document | Owner | Version | Standard |
| --- | --- | --- | --- | --- |
| 18 | SLA / SLO / SLI Specification | SRE Lead | 1.0 | Google SRE Workbook |
| 19 | Incident Management Plan | SRE Lead | 1.0 | ITIL 4 + SOC 2 CC7 |
| 20 | Change &amp; Release Management Plan | VP Engineering | 1.0 | ITIL 4 + SOC 2 CC8 |
| 21 | Operations Runbook &amp; SOPs | SRE Lead / Platform Lead | 1.0 | ITIL 4 Service Operation |

### 4.7 Cluster 7 — Design &amp; End-User

| # | Document | Owner | Version | Standard |
| --- | --- | --- | --- | --- |
| 22 | UI/UX Design System &amp; Style Guide | Design Lead | 1.0 | ISO 9241-210 + WCAG 2.1 AA |
| 23 | End-User Manual | Head of CS / Documentation Lead | 1.0 | IEEE 26511:2018 |

### 4.8 Cluster 8 — Governance &amp; Index

| # | Document | Owner | Version | Standard |
| --- | --- | --- | --- | --- |
| 24 | Developer Onboarding Guide | VP Engineering / EMs | 1.0 | Internal |
| 25 | Documentation Gap Analysis (this revision basis) | VPE / PMO | 1.0 | Internal |
| — | Documentation Package Index (this document) | VPE / PMO | 1.1 | Index |

## 5. Cross-Reference Matrix
The following matrix shows the principal cross-references between documents. A check (✓) indicates the row document explicitly cites or depends on the column document.

| From ↓ / To → | PRD | SRS | NFR | Arch | InfoSec | DPDP | Test | DR/BCP | Inc Mgmt |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Charter | ✓ | — | — | — | — | — | — | — | — |
| SRS | ✓ | — | ✓ | ✓ | — | ✓ | — | — | — |
| NFR | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Architecture | ✓ | ✓ | ✓ | — | ✓ | ✓ | — | ✓ | — |
| Test Strategy | — | ✓ | ✓ | — | — | — | — | — | — |
| InfoSec Policy | — | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ |
| DPDP Policy | — | — | ✓ | — | ✓ | — | — | — | ✓ |
| DR/BCP | — | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| SLA/SLO/SLI | — | — | ✓ | — | — | — | — | ✓ | ✓ |
| Incident Mgmt | — | — | ✓ | — | ✓ | ✓ | — | ✓ | — |
| Change/Release | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — |
| Ops Runbook | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Coding Standards | — | — | ✓ | ✓ | ✓ | — | ✓ | — | — |
| ADR Index | — | — | — | ✓ | ✓ | — | — | — | — |
| Risk Register | ✓ | — | — | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| RACI | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| Design System | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| End-User Manual | ✓ | — | — | — | ✓ | ✓ | — | — | — |

## 6. Standards Conformance Map

| Standard | Conformant Documents |
| --- | --- |
| PMBOK 7 | Charter, RACI, Risk Register |
| IEEE 12207 | Whole package (life-cycle frame) |
| IEEE 29148:2018 | SRS |
| IEEE 26511:2018 | End-User Manual |
| ISO/IEC 25010:2011 | NFR Specification |
| ISO/IEC 27001:2022 | InfoSec Policy |
| ISO 22301:2019 | DR &amp; BCP |
| ISO 31000 | Risk Register |
| ISO 9241-210 | UI/UX Design System |
| ITIL 4 | Incident Mgmt, Change/Release Mgmt, Ops Runbook |
| SOC 2 Trust Services Criteria | InfoSec Policy (CC), Incident Mgmt (CC7), Change/Release (CC8) |
| SWEBOK Guide v3 | Coding Standards |
| Google SRE Workbook | SLA/SLO/SLI |
| Michael Nygard ADR | ADR Index |
| WCAG 2.1 AA | UI/UX Design System |
| DPDP Act 2023 (India) | Data Privacy &amp; DPDP Policy |
| GDPR | Data Privacy &amp; DPDP Policy |
| OpenAPI 3.1 | API Specification |

## 7. Audience Quick-Pick
### 7.1 New Engineer (first 2 weeks)
- Developer Onboarding Guide → orient yourself.
- Technical Architecture + ADR Index → understand the system.
- Coding Standards → follow conventions.
- Operations Runbook → know what to do when paged.
- Test Strategy → know how we verify.
### 7.2 New Product Manager
- PRD → product surface.
- PRD Traceability Matrix → from requirement to test.
- Sprint Execution Plan → cadence.
- RACI → who owns what.
- Risk Register → known unknowns.
### 7.3 SOC 2 / ISO 27001 Auditor
- InfoSec Policy → primary control framework.
- Data Privacy Policy → privacy controls.
- Incident Mgmt + Change/Release Mgmt → SOC 2 CC7 &amp; CC8 evidence.
- DR/BCP → continuity controls.
- Risk Register → ISO 31000 evidence.
- RACI → control owner accountability.
### 7.4 Customer Procurement / Security-Review Team
- InfoSec Policy + Data Privacy Policy → due diligence.
- SLA/SLO/SLI Specification → service commitments.
- DR/BCP → continuity assurance.
- End-User Manual → product capability.
### 7.5 Investor / Board Member
- Project Charter → mandate, budget, milestones.
- Risk Register → top risks and treatment.
- Sprint Execution Plan → progress trajectory.
- RACI → governance.
## 8. Document Lifecycle
- Status: Draft → Review → Approved → Published → Superseded → Archived.
- Version control: SemVer (Major.Minor) at the document level; v1.0 = baseline.
- Major version bump: substantive content change, structure overhaul, or scope change.
- Minor version bump: clarifications, typo fixes, formatting.
- Review cadence stated in each document; re-attestation by Owner annually.
- Source: build script in /_tools; rendered .docx in project root.
## 9. How to Propose a Change
1. Open a JIRA DOC-&lt;id&gt; describing the proposed change and its motivation.
1. Update the appropriate /_tools/build_&lt;doc&gt;.py script.
1. Open a PR; reviewers per CODEOWNERS.
1. On merge, run python _tools/build_&lt;doc&gt;.py to regenerate the docx.
1. Update version field; add a Change Log entry.
1. If cross-references shift, update this Index in the same PR.
## 10. Glossary of Owner Roles

| Role | Holder (April 2026) |
| --- | --- |
| CEO | Executive Sponsor |
| CPO | Chief Product Officer |
| CTO / VP Engineering | Project Director |
| EM (per pod) | Engineering Manager |
| Tech Lead (BE / FE / AI / Platform) | Discipline lead within an EM's team |
| QA Lead | Owns test strategy and quality gates |
| Security Lead | Owns InfoSec controls and pentest |
| DPO | Data Protection Officer (privacy + DSAR) |
| SRE Lead / Platform Lead | Owns reliability, on-call, runbooks |
| Design Lead | Owns visual &amp; interaction system |
| PMO Head | Owns project governance, RACI, risk register |
| Head of CS | Owns customer success and end-user docs |
| Documentation Lead | Owns end-user manual, knowledge base |

## 11. Storage &amp; Distribution
- Source of truth: /_tools/build_*.py scripts in the monorepo (version-controlled).
- Rendered output: /WBMSG_*_v*.docx in the project root.
- Mirror: Confluence &gt; Documentation &gt; Approved (auto-sync nightly).
- External-facing: relevant subset (Privacy Policy, End-User Manual) published to WBMSG.in.
- Customer due-diligence pack: subset shared via secure data room (Drata Trust).
## 12. Sign-Off

| Role | Name | Signature | Date |
| --- | --- | --- | --- |
| CEO | — | — | — |
| CTO / VP Engineering | — | — | — |
| Chief Product Officer | — | — | — |
| PMO Head | — | — | — |
| Security Lead | — | — | — |
| Data Protection Officer | — | — | — |

## 13. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 10-Apr-2026 | PMO | Baseline index of 9 starter documents |
| 1.1 | 26-Apr-2026 | PMO + VPE | Added 16 documents authored at end of Sprint 0; re-clustered; cross-reference matrix; standards conformance map |

End of Documentation Package Index | WBMSG v1.1 | April 2026