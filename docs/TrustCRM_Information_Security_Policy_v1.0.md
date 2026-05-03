# WBMSG
# Information Security Policy
ISO/IEC 27001:2022 + SOC 2 Common Criteria Aligned
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Security Lead / CISO-equivalent
## 1. Purpose &amp; Scope
This policy establishes the principles, controls, and accountabilities that protect WBMSG's information assets — customer data, source code, infrastructure, and business records — from unauthorised access, disclosure, alteration, or destruction. It applies to all employees, contractors, and third parties with access to WBMSG systems.
Scope: all production, staging, and corporate IT environments operated by WBMSG. Aligned to ISO/IEC 27001:2022 and the SOC 2 Trust Services Criteria (Security, Availability, Confidentiality, Processing Integrity, Privacy).
## 2. Governance
### 2.1 Information Security Steering Committee (ISSC)
- Chair: CTO. Members: Security Lead, DPO, VP Engineering, Head of CS, Legal Counsel.
- Meets monthly; reviews incidents, audit findings, risk register, and policy exceptions.
- Quarterly review with CEO and Board sub-committee.
### 2.2 Roles

| Role | Responsibility |
| --- | --- |
| Security Lead | Owns this policy; runs annual control review and pentest |
| Data Protection Officer | Owns DPDP/GDPR compliance; handles DSARs |
| VP Engineering | Operational security in delivery and SRE |
| Engineering Managers | Enforce secure-SDLC in their pods |
| All Employees | Comply with policy; report incidents within 1 hour |

## 3. Asset Management
- All production assets enumerated in the CMDB (Asset Inventory in Notion).
- Each asset has an owner, classification, and lifecycle state (Proposed, Active, Sunset, Retired).
- Customer data classified Confidential by default. Internal documents tagged at creation.
- Removable media is prohibited on production-bearing machines.
### 3.1 Data Classification

| Class | Examples | Handling Rules |
| --- | --- | --- |
| Restricted | Customer messages, contact PII, payment tokens | Encrypted at rest + transit; access logged; least-privilege |
| Confidential | Internal financials, source code, contracts | Need-to-know; SSO-gated; not on personal devices |
| Internal | Roadmaps, architecture diagrams | Org-wide read; no public sharing |
| Public | Marketing site, blog, OSS code | Pre-approved; no PII allowed |

## 4. Access Control
### 4.1 Identity
- Single Sign-On via Clerk for all internal apps; SAML for tier-3 vendors that support it.
- MFA enforced (TOTP or hardware key) for all employees on all production-touching systems.
- No shared accounts. Service accounts have a named owner and rotation owner.
### 4.2 Authorisation
- Principle of least privilege; default-deny.
- Production access via just-in-time elevation (Teleport); session recorded.
- Quarterly access review; 100% reviewed within 30 days of due date.
- Tenant data: every query enforces organization_id at the ORM layer; verified by automated test on every PR.
### 4.3 Account Lifecycle
- Joiner: access provisioned via JIRA ticket, signed off by EM and Security Lead within 1 BD.
- Mover: re-baselined within 5 BD of role change.
- Leaver: revoked within 1 hour of HR exit signal; audit log captured for 1 year.
## 5. Cryptography
- TLS 1.3 on all public endpoints; HSTS preload.
- AES-256 GCM at rest (Postgres TDE, S3 SSE-KMS, snapshot encryption).
- Keys managed by AWS KMS; CMKs rotated annually; audit log immutable.
- Webhook payloads signed with HMAC-SHA256; signing key rotated on customer request.
- Passwords managed by Clerk (Argon2id); WBMSG never receives or stores raw credentials.
## 6. Physical &amp; Environmental Security
- Production hosted at AWS ap-south-1 — physical security inherited from AWS SOC 2/ISO 27001 attestations (annually reviewed).
- WBMSG head office: badge-controlled access; CCTV at entry; visitor log; no production data printed.
- Remote workers: company-issued laptops with full-disk encryption (FileVault / BitLocker), MDM (Kandji), screen-lock 5 min idle.
## 7. Operations Security
### 7.1 Change Management
- All production changes flow through PRs with ≥ 1 reviewer, CI green, and Security Lead approval for high-risk changes.
- Emergency changes require dual approval and a post-change review within 5 BD.
- Release calendar maintained; freeze windows respected (see Change &amp; Release Mgmt Plan).
### 7.2 Logging &amp; Monitoring
- Centralised logging via Datadog with 90-day hot retention; 7-year cold for audit-relevant logs.
- Security-relevant events alert to PagerDuty (on-call SRE + Security Lead).
- Tamper-evident audit logs for admin actions, auth events, data exports.
- Anomaly detection for unusual data export volume, login geographies, and tenant-cross access attempts.
### 7.3 Vulnerability Management
- SAST (Snyk Code), SCA (Snyk Open Source), and container scan (Trivy) on every PR; gate at High/Critical.
- DAST (OWASP ZAP) weekly against staging.
- Annual external pentest by a CREST-certified firm.
- Patch SLA: Critical CVE in production within 7 days; High within 30; Medium within 90.
- Public bug-bounty programme launches at GA (Bugcrowd, scope: production endpoints).
### 7.4 Backup
- Postgres point-in-time recovery (5-min RPO) within Supabase Managed.
- Daily full snapshots replicated to ap-south-2; tested monthly.
- Object storage versioning + 35-day retention.
- Backup restoration drill quarterly (see DR &amp; BCP).
### 7.5 Malware Protection
- Endpoint EDR (CrowdStrike Falcon) on all employee laptops.
- No execution of unsigned binaries on production servers; appplication-only image base.
- Email gateway scanning (Google Workspace baseline + Proofpoint TAP).
## 8. Communications Security
- Network segmentation: prod / stage / dev VPCs; no peering between prod and corporate.
- Outbound from prod restricted to allow-listed CIDRs (Meta, Stripe, OpenAI, etc.).
- Bastion hosts gated by Teleport with session recording.
- All laptops VPN to corporate; production access only via Teleport over VPN.
## 9. System Acquisition, Development &amp; Maintenance — Secure SDLC
- Threat-modelling for every new service or significant feature (STRIDE).
- Security review checkpoint at design (architecture review) and pre-merge (PR template).
- Mandatory secure-coding training for all engineers within 30 days of joining; refresh annually.
- Dependency policy: no direct production dependency without licence + maintenance review.
- Secrets in AWS Secrets Manager; pre-commit hook blocks any high-entropy string in code.
## 10. Supplier Relationships
- Tier-1 vendors (data processors): SOC 2 Type II review on contract; annual re-attestation.
- Tier-2 vendors: questionnaire + DPA; reviewed at renewal.
- Tier-3 vendors: standard purchase order; lightweight check.
- Sub-processor list published on WBMSG.in/security/subprocessors with 30-day change notice to customers.
## 11. Incident Management (cross-ref Incident Mgmt Plan)
- All employees report suspected security events to security@WBMSG.in or the #sec-alerts Slack within 1 hour of detection.
- Severity classification: P1 (active breach / data exposure), P2 (credible threat), P3 (vulnerability), P4 (info).
- P1: Incident Commander appointed within 30 min; customer notification within 24 h if data affected.
- Post-mortem published within 5 BD; corrective actions tracked to closure.
## 12. Business Continuity (cross-ref DR &amp; BCP)
- Critical processes identified; RTO/RPO documented per service.
- Failover and restore drills quarterly; results reported to ISSC.
- Pandemic / weather / power continuity plan covers fully-remote operating mode.
## 13. Compliance
- SOC 2 Type II: continuous compliance via Vanta; auditor of record TBD.
- ISO/IEC 27001: gap assessment Sprint 18; certification target Year 2.
- DPDP Act 2023: ongoing per Data Privacy Policy; DPO appointed.
- GST + Companies Act: financial controls owned by CFO.
- Industry: WhatsApp Business Solution Provider terms compliance reviewed annually.
## 14. Acceptable Use
- Company devices and accounts are for business use; reasonable personal use permitted.
- Prohibited: sharing credentials; bypassing security controls; storing customer data on personal devices; installing unapproved software on production-touching machines.
- Use of generative AI tools with customer data permitted only via approved enterprise endpoints (no public ChatGPT free tier with customer PII).
- All employees acknowledge this policy at onboarding and annually.
## 15. Awareness &amp; Training
- Onboarding security module within 7 days of joining.
- Annual refresher; simulated-phishing campaign quarterly.
- Role-specific training: secure coding (engineers), DSAR handling (CS, DPO), incident response (SRE).
- Compliance ≥ 95% completion within due window; tracked in HRIS.
## 16. Policy Exceptions
- Exceptions logged in the Risk Register with severity, owner, expiry (max 90 days), and compensating control.
- Approval: Security Lead for Low/Medium; CTO for High; ISSC for Critical.
- All open exceptions reviewed monthly; auto-expire if not renewed.
## 17. Enforcement
- Violations trigger investigation by HR + Security; outcomes range from training to termination.
- Wilful exfiltration of customer data is grounds for immediate dismissal and legal action.
- Non-employee violators per the contract clause; data-processor agreements specify breach remedies.
## 18. Review
- Annual review and re-attestation by Security Lead, signed by CTO.
- Triggered review on: major incident, regulatory change, organisational change, technology change.
- Version history maintained at the foot of this document.
## 19. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | Security Lead | Baseline |

End of Information Security Policy | WBMSG v1.0 | April 2026 | ISO 27001 / SOC 2 aligned