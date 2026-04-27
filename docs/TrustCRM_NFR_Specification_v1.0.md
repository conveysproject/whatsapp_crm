# TrustCRM
# Non-Functional Requirements Specification
Quality Attributes — ISO/IEC 25010:2011 Quality Model
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
VP Engineering / QA Lead
## 1. Purpose
This document specifies the Non-Functional Requirements (NFRs) for the TrustCRM platform v1.0. NFRs are defined against the eight ISO/IEC 25010 quality characteristics: Functional Suitability, Performance Efficiency, Compatibility, Usability, Reliability, Security, Maintainability, and Portability. Each NFR is testable, has a measurement method, and a target.
### 1.1 Conventions
- Each NFR has a unique ID: NFR-&lt;characteristic&gt;-&lt;n&gt;.
- Targets are absolute or percentile (p50, p95, p99); steady-state unless noted otherwise.
- Measurement methods reference Datadog dashboards, k6 load runs, Lighthouse audits, or third-party reports as applicable.
- Targets are baseline; per-tier (Free/Starter/Pro/Enterprise) deviations are noted in §10 Plan Tiering.
## 2. Performance Efficiency
### 2.1 Time Behaviour

| ID | Target | Measurement |
| --- | --- | --- |
| NFR-PERF-001 | API GET p95 ≤ 300 ms (steady, ap-south-1 origin) | Datadog APM, 7-day rolling |
| NFR-PERF-002 | API POST p95 ≤ 500 ms (excluding Meta-bound calls) | Datadog APM |
| NFR-PERF-003 | WhatsApp webhook ingest end-to-end ≤ 3 s | Sentry transaction trace |
| NFR-PERF-004 | Web app First Contentful Paint p75 ≤ 1.8 s on 4G | Lighthouse / Web Vitals |
| NFR-PERF-005 | Web app Largest Contentful Paint p75 ≤ 2.5 s on 4G | Web Vitals (CrUX dashboard) |
| NFR-PERF-006 | Inbox conversation list initial paint ≤ 1.0 s | Synthetic Lighthouse |
| NFR-PERF-007 | Time-to-Interactive p75 ≤ 3.0 s | Web Vitals |
| NFR-PERF-008 | Bulk import 50K rows ≤ 90 s | Sidekiq job histogram |
| NFR-PERF-009 | Campaign send rate ≥ 80 msgs/sec sustained per organisation | Throughput counter |
| NFR-PERF-010 | AI inference (cached) p95 ≤ 1.2 s, (uncached) p95 ≤ 4.5 s | OpenAI latency log |

### 2.2 Resource Utilisation
- API container CPU steady utilisation ≤ 65% before auto-scale triggers.
- Database connection pool utilisation ≤ 75% steady-state.
- S3-equivalent storage growth alarm at 80% of provisioned monthly quota.
### 2.3 Capacity

| Dimension | Target (Year 1) | Target (3 years) |
| --- | --- | --- |
| Concurrent organisations | 5,000 | 100,000 |
| Concurrent users | 20,000 | 400,000 |
| Inbound msgs / minute (peak) | 150,000 | 3,000,000 |
| Stored messages | 1.2 B | 30 B |
| Stored contacts | 200 M | 4 B |

## 3. Reliability

| ID | Target | Measurement |
| --- | --- | --- |
| NFR-REL-001 | Availability ≥ 99.9% per calendar month (excluding planned maintenance) | Status-page uptime |
| NFR-REL-002 | Maximum unplanned downtime per incident ≤ 30 min | Incident timeline |
| NFR-REL-003 | Mean Time to Recovery (MTTR) for P1 ≤ 60 min | Incident records |
| NFR-REL-004 | RPO (Recovery Point Objective) ≤ 5 min | Backup snapshot interval |
| NFR-REL-005 | RTO (Recovery Time Objective) ≤ 60 min | DR drill report (quarterly) |
| NFR-REL-006 | Webhook delivery success ≥ 99.95% within 60 s; eventual delivery ≥ 99.99% within 24 h | Outbox metrics |
| NFR-REL-007 | Idempotency: duplicate POST with same Idempotency-Key returns identical response within 24 h window | API contract test |
| NFR-REL-008 | No data loss on auto-scale-down — graceful drain | Chaos test report |
| NFR-REL-009 | Quarterly DR drill MUST achieve RTO and RPO targets | DR drill log |

## 4. Security (Cross-references InfoSec Policy + DPDP Policy)

| ID | Target | Measurement |
| --- | --- | --- |
| NFR-SEC-001 | All traffic in transit encrypted with TLS ≥ 1.3 (no TLS 1.0 / 1.1 / 1.2 listeners) | SSL Labs A+ rating |
| NFR-SEC-002 | All data at rest encrypted with AES-256 (Postgres, S3, backups) | Cloud config audit |
| NFR-SEC-003 | Customer secrets stored in AWS Secrets Manager — never in env/git | Secret-scan CI gate |
| NFR-SEC-004 | PII columns tagged and never logged in plaintext | Log redaction lint rule |
| NFR-SEC-005 | MFA enforced for Owner/Admin roles | Auth event audit |
| NFR-SEC-006 | Critical CVEs patched within 7 days; High within 30 | Snyk monitor |
| NFR-SEC-007 | Penetration test annually; remediations closed before next audit cycle | Pentest report |
| NFR-SEC-008 | SOC 2 Type II audit window ≥ 6 months without material exception | SOC 2 report |
| NFR-SEC-009 | DPDP Act 2023 compliance attested annually by appointed DPO | DPO attestation |
| NFR-SEC-010 | All admin actions immutable-logged for 1 year (then archived 6 more) | Audit log review |
| NFR-SEC-011 | Tenant isolation: zero cross-org reads in penetration tests | Pentest results |

## 5. Usability

| ID | Target | Measurement |
| --- | --- | --- |
| NFR-USE-001 | Time-to-First-Value (sign-up → first WA message sent) p50 ≤ 30 minutes | Funnel analytics |
| NFR-USE-002 | Onboarding wizard completion ≥ 85% in Day 1 | PostHog funnel |
| NFR-USE-003 | Inbox SUS (System Usability Scale) score ≥ 75 | Quarterly user survey |
| NFR-USE-004 | WCAG 2.1 AA conformance ≥ 95% pages (axe-core scan) | axe CI report |
| NFR-USE-005 | Lighthouse Accessibility score ≥ 90 on critical paths | Lighthouse CI |
| NFR-USE-006 | All actions reachable via keyboard with no-trap, with visible focus | Manual a11y review |
| NFR-USE-007 | Localisation: English (en-IN) at GA; Hindi + Marathi by Month 3 post-GA | i18n coverage |
| NFR-USE-008 | All currency displayed in INR for India accounts; multi-currency for international | QA checklist |
| NFR-USE-009 | Dark-mode parity: visual a11y contrast ≥ 4.5:1 in both themes | axe colour-contrast scan |

## 6. Compatibility
### 6.1 Browser &amp; OS Support

| Browser | Version Floor | Notes |
| --- | --- | --- |
| Chrome | 120+ | Primary support |
| Edge | 120+ |  |
| Safari | 17+ | macOS + iOS |
| Firefox | 120+ |  |
| Samsung Internet (Android) | 23+ | PWA install path |

### 6.2 Co-existence &amp; Interoperability
- Customer can run TrustCRM alongside other WhatsApp inboxes — non-exclusive Meta token.
- CSV exports MUST be valid Excel and Google Sheets imports out-of-box.
- Webhook payload MUST be valid JSON conforming to the published JSON-Schema.
- iCal export of campaign schedule MUST be valid RFC 5545.
## 7. Maintainability

| ID | Target | Measurement |
| --- | --- | --- |
| NFR-MNT-001 | Unit test coverage ≥ 75% lines on backend, ≥ 60% on frontend | Jest / Vitest report |
| NFR-MNT-002 | Critical-path E2E tests pass in ≤ 10 min on CI | GH Actions duration |
| NFR-MNT-003 | CI pipeline p50 wall time ≤ 12 min | GH Actions metric |
| NFR-MNT-004 | Cyclomatic complexity per function ≤ 10 (warn) / 15 (fail) | ESLint complexity rule |
| NFR-MNT-005 | No file &gt; 500 LoC except generated; flagged in PR | ESLint max-lines |
| NFR-MNT-006 | Docstring + JSDoc on every exported public function/component | ESLint require-jsdoc |
| NFR-MNT-007 | Code-owners file mandates ≥ 1 reviewer per directory | GitHub setting |
| NFR-MNT-008 | OpenAPI spec auto-generated from code; drift fails CI | spec-diff job |
| NFR-MNT-009 | Database migrations are forward-compatible (zero-downtime) for the prior release | Migration review checklist |

## 8. Portability
- Application MUST be deployable to any AWS region with parameterised infra-as-code (Terraform).
- Database MUST be migratable to self-hosted Postgres 16 with documented migration steps (Enterprise option, post-GA).
- No proprietary cloud-only services in the critical path that prevent re-host within 30 days.
- Container images MUST be built from a published Dockerfile reproducible by any developer.
## 9. Functional Suitability — Quality Sub-Attributes
- Functional Completeness: 100% of MUST requirements verified by GA.
- Functional Correctness: defect escape rate ≤ 0.5 / KLoC at GA; Critical defects = 0.
- Functional Appropriateness: ≥ 80% of users report 'product fits my workflow' in design-partner survey.
## 10. Plan Tiering — NFR Variations

| Aspect | Free | Starter | Pro | Enterprise |
| --- | --- | --- | --- | --- |
| Daily AI inference cap | INR 50 | INR 200 | INR 1,000 | Custom |
| Concurrent agents | 2 | 5 | 25 | Unlimited |
| Campaign throughput | 10 msg/s | 30 msg/s | 80 msg/s | 200 msg/s |
| Webhook retention | 7 d | 30 d | 90 d | 365 d |
| Audit log retention | 30 d | 90 d | 1 y | 7 y |
| SSO (SAML) | — | — | Add-on | Included |
| Uptime SLA | Best effort | 99.5% | 99.9% | 99.95% |
| Support channel | Community | Email | Email + Chat | 24×7 Phone + CSM |

## 11. Verification Plan
- Performance NFRs verified by quarterly k6 load tests against staging mirror of production.
- Reliability NFRs verified by quarterly DR drill and continuous synthetic monitoring.
- Security NFRs verified by annual third-party pentest and continuous SAST/DAST in CI.
- Usability NFRs verified by quarterly user research panel (n ≥ 20) and continuous PostHog telemetry.
- All NFRs reviewed at every quarterly Operational Review and re-baselined as needed.
End of NFR Specification | TrustCRM v1.0 | April 2026 | ISO/IEC 25010 conformant