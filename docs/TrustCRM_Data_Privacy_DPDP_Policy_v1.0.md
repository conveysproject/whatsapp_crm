# TrustCRM
# Data Privacy &amp; DPDP Compliance Policy
DPDP Act 2023 (India) + GDPR-aligned Privacy Programme
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Data Protection Officer
## 1. Purpose &amp; Scope
This policy establishes how TrustCRM collects, processes, stores, transfers, and disposes of personal data in compliance with the Digital Personal Data Protection Act 2023 (India), the EU General Data Protection Regulation (GDPR), and other applicable privacy laws. It applies to all personal data of customers, end-users (data principals), employees, and third parties.
TrustCRM acts as a Data Fiduciary (DPDP) / Data Controller (GDPR) for its own employee and prospect data, and as a Data Processor (GDPR) / Significant Data Fiduciary's processor (DPDP) for customer-uploaded contact and messaging data.
## 2. Definitions

| Term | Meaning |
| --- | --- |
| Personal Data | Any data about an identified or identifiable natural person |
| Sensitive Personal Data | Health, financial, biometric, sexual orientation, religious data — prohibited from inbox storage by ToS |
| Data Principal | The natural person to whom personal data relates (DPDP terminology) |
| Data Fiduciary | The entity that determines the purpose and means of processing (DPDP); equivalent to GDPR Controller |
| Data Processor | An entity that processes data on behalf of a Fiduciary (DPDP/GDPR) |
| Consent Manager | DPDP-defined entity for consent lifecycle management |
| Processing | Any operation performed on personal data (collection, storage, alteration, transfer, deletion) |
| DSR / DSAR | Data Subject Request / Data Subject Access Request |

## 3. Principles
1. Lawfulness, fairness, transparency — every processing activity has a documented lawful basis (DPDP §6, GDPR Art. 6).
1. Purpose limitation — data is collected for specified purposes and not further processed in incompatible ways.
1. Data minimisation — only data necessary for the purpose is collected.
1. Accuracy — data is kept accurate; principals can correct inaccuracies via in-product UX.
1. Storage limitation — data is retained only as long as needed (see §8 Retention).
1. Integrity &amp; confidentiality — encryption in transit and at rest; access controls in InfoSec Policy.
1. Accountability — DPO maintains records of processing (RoPA); annual audit by external counsel.
## 4. Lawful Basis &amp; Records of Processing (RoPA)

| Processing Activity | Lawful Basis (DPDP) | Lawful Basis (GDPR) | Retention |
| --- | --- | --- | --- |
| Account creation &amp; login | Consent + contractual necessity | Art. 6(1)(b) Contract | Account life + 90 days |
| Customer's contact records | Customer-as-Fiduciary; we are processor | Art. 28 Processor | Per customer instruction |
| WhatsApp inbox messages | Customer-as-Fiduciary; we are processor | Art. 28 Processor | Per customer retention setting |
| Billing &amp; invoicing | Statutory obligation (GST, Cos. Act) | Art. 6(1)(c) Legal obligation | 8 financial years |
| Product analytics (PostHog) | Legitimate interest, opt-out | Art. 6(1)(f) Legitimate interest | 13 months rolling |
| Marketing emails to prospects | Explicit consent | Art. 6(1)(a) Consent | Until unsubscribe |
| Customer support tickets | Contractual necessity | Art. 6(1)(b) Contract | Account life + 2 years |
| Employee HR records | Statutory + contractual | Art. 6(1)(b)/(c) | Per Indian law (3-7 years post-exit) |

## 5. Consent Management
- Consent UX is layered: short notice at point of capture, link to full Privacy Notice.
- Consent is freely given, specific, informed, unambiguous, and revocable in one click.
- Granular consent for: account use, marketing emails, in-product analytics, AI personalisation.
- Consent log captured with timestamp, IP, version of notice shown, and method (web/API).
- DPDP Consent Manager interoperability: ready to integrate when MeitY certifies CMs (Year 2 plan).
- Children: TrustCRM is not directed to users under 18; verifiable parental consent required if collected.
## 6. Data Principal Rights
### 6.1 Rights We Honour
- Right to access (DPDP §11, GDPR Art. 15) — full export within 30 days.
- Right to correction (DPDP §12, GDPR Art. 16) — in-product UX for self-service.
- Right to erasure (DPDP §12, GDPR Art. 17) — within 30 days unless retention required by law.
- Right to portability (GDPR Art. 20) — JSON/CSV export of all personal data.
- Right to nominate (DPDP §14) — principal nominates a person to exercise rights in case of incapacity.
- Right to grievance redressal (DPDP §13) — DPO acknowledges within 7 days, resolves within 30.
- Right to object to automated decision-making — opt-out of AI-assisted features.
- Right to withdraw consent — same UX ease as giving consent.
### 6.2 Handling SLA

| Request Type | Acknowledgement | Resolution | Owner |
| --- | --- | --- | --- |
| Access request | 1 BD | 30 calendar days | DPO |
| Erasure request | 1 BD | 30 calendar days | DPO + Eng on-call |
| Correction request | 1 BD | 10 calendar days | DPO |
| Portability request | 1 BD | 30 calendar days | DPO + Eng on-call |
| Grievance / complaint | 7 calendar days | 30 calendar days | DPO |
| Withdraw consent | Real-time (in-product) | Real-time | Self-service |

### 6.3 Verification
- Account-holder requests: verified via Clerk SSO session.
- Third-party requests: verified via two-factor proof (email + phone or government ID).
- Authorised agent: verified power-of-attorney letter.
## 7. Cross-Border Transfers
- Primary processing in AWS ap-south-1 (Mumbai). All customer Restricted data stays in India.
- Sub-processors in other jurisdictions (e.g., OpenAI in US): used only for non-PII or pseudonymised data, governed by Standard Contractual Clauses (GDPR) or DPDP-permitted transfer mechanism.
- Customer-explicit consent required for any feature that transfers identifiable PII outside India.
- Annual transfer impact assessment (TIA) by DPO for each cross-border processor.
## 8. Data Retention &amp; Disposal

| Data Type | Active Retention | Archive | Disposal Method |
| --- | --- | --- | --- |
| Customer messages (in-platform) | Per customer setting (default 1 y) | + 30 d soft-delete | Crypto-shred (key destruction) |
| Customer contacts | Lifetime of account | 30 d post account close | Crypto-shred |
| Billing invoices | 8 financial years | — | Per archival policy |
| Audit logs | 1 y hot, 6 y cold | — | Crypto-shred at end-of-life |
| Application logs | 30 d hot, 90 d cold | — | Auto-purge |
| Backup snapshots | 35 d | — | Auto-expire |
| Employee HR data | Per Indian law | Per Indian law | Secure shred (paper) + crypto-shred (digital) |
| Marketing leads | Until unsubscribe + 30 d | — | Auto-delete |

## 9. Security of Personal Data (Cross-ref InfoSec Policy)
- AES-256 at rest, TLS 1.3 in transit, AWS KMS-managed keys.
- Tenant isolation enforced at ORM layer; verified by automated PR-gate test and annual pentest.
- PII columns tagged in code; logs are scrubbed by structured logger middleware.
- DPO and Security Lead meet monthly to review privacy-relevant security events.
## 10. Data Breach Notification
- Any incident affecting personal data is escalated to DPO within 1 hour of detection.
- DPDP §8(6): Data Protection Board of India notified within 72 hours of becoming aware (or sooner if rules tighten).
- GDPR Art. 33: Lead Supervisory Authority notified within 72 hours.
- Affected data principals notified directly without undue delay if high risk to rights and freedoms.
- Notification includes: nature of breach, categories and approximate volume, contact point, likely consequences, measures taken.
- All breach communications drafted by DPO + Legal; approved by CEO before issue.
## 11. Privacy by Design &amp; Default
- All new features undergo a Privacy Impact Assessment (PIA) at design phase.
- PIA template covers: necessity, proportionality, risks to rights, safeguards, residual risk.
- Default settings minimise data collection; opt-in for any non-essential processing.
- Pseudonymisation and anonymisation considered at every stage.
- DPO sits in architecture review for any feature processing new data category.
## 12. AI &amp; Automated Processing
- AI features (auto-reply, intent classification, summary) are documented in Privacy Notice with the model used and data flow.
- Customer can opt-out of AI processing per organisation; admin UI exposes the toggle.
- Customer messages may be sent to LLM providers under contract; PII redaction filter applied to prompts.
- Model providers contractually prohibited from training on customer data.
- Output of AI is reviewed by human before being sent to a customer's end-user (no fully automated decisions with legal effect, per GDPR Art. 22).
## 13. Sub-processor Management
- All sub-processors enumerated at trustcrm.in/security/subprocessors.
- 30 calendar days advance notice for sub-processor additions; customer can object.
- Contractual obligations equivalent to or stronger than ours (DPA, security, audit rights).
- Annual review of each sub-processor's SOC 2/ISO 27001/equivalent attestation.
### 13.1 Current Tier-1 Sub-processors (April 2026 baseline)

| Vendor | Role | Data Processed | Region | Compliance |
| --- | --- | --- | --- | --- |
| AWS | Infrastructure | All customer data | ap-south-1 | ISO 27001, SOC 2, PCI |
| Supabase | Managed Postgres + Auth helper | All transactional data | ap-south-1 | SOC 2 Type II |
| Vercel | Front-end edge | Cookies, page views | Global edge | SOC 2 Type II |
| Clerk | Identity &amp; SSO | Identity attributes | US (replication to ap-south-1 EOY) | SOC 2 Type II |
| Stripe | Payments (international) | Payment metadata, billing PII | US/EU | PCI DSS L1, SOC 2 |
| Razorpay | Payments (India) | Payment metadata, billing PII | India | PCI DSS L1, ISO 27001 |
| Datadog | Logging/observability | Application telemetry (PII-scrubbed) | EU/US | SOC 2 Type II |
| OpenAI | AI inference | Pseudonymised prompts | US | SOC 2 Type II, no training opt-out |
| Anthropic | AI inference (alt) | Pseudonymised prompts | US | SOC 2 Type II, no training default |

## 14. Privacy Notice
- Public Privacy Notice maintained at trustcrm.in/privacy.
- Layered: short summary + full notice; reading time displayed.
- Versioned; material changes notified by email and in-app banner.
- Localised: English (en-IN) at GA; Hindi + Marathi by Month 3 post-GA.
- Last reviewed annually; trigger-reviewed on change of processing.
## 15. DPO Office
- DPO is appointed by the Board, reports to Legal, with direct line to CEO.
- Independent — cannot be penalised for performing the role.
- Reachable at dpo@trustcrm.in for principals, regulators, and staff.
- Maintains: RoPA, Consent log, DSAR log, Breach log, Sub-processor list, PIA records.
- Annual report to Board summarising privacy posture and incidents.
## 16. Training &amp; Awareness
- Privacy module mandatory at onboarding (within 7 days of joining).
- Annual refresher with role-specific tracks (engineering, CS, sales).
- Phishing-and-data-handling simulation quarterly; clickers receive remedial training.
- DPO publishes monthly 'Privacy Tip' newsletter internally.
## 17. Compliance Verification
- Annual external privacy audit by Cyril Amarchand Mangaldas (or equivalent).
- Quarterly internal control review by DPO + Security Lead.
- DPDP-specific assessment to be re-run upon publication of MeitY rules.
- GDPR Art. 30 records of processing maintained and reviewed annually.
- Records kept for 5 years to evidence compliance (DPDP §8(8) allowance).
## 18. Enforcement &amp; Sanctions
- Internal violations: investigation by HR + DPO + Legal; outcomes from training to termination.
- Wilful unlawful processing: grounds for dismissal and referral to authorities.
- Sub-processor breach: contractual remedies including audit, suspension, and termination.
- Customer (Fiduciary-side) violations: TrustCRM may suspend service per the DPA breach clauses.
## 19. Review
- Annual review by DPO; sign-off by Legal Counsel and CEO.
- Triggered review on: regulatory change, material incident, technology change.
- Version history at the foot of this document.
## 20. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | DPO | Baseline DPDP + GDPR programme |

End of Data Privacy &amp; DPDP Compliance Policy | TrustCRM v1.0 | April 2026