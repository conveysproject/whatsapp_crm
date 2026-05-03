# WBMSG
# Disaster Recovery &amp; Business Continuity Plan
ISO 22301:2019 — Business Continuity Management System
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Head of Platform / SRE Lead
## 1. Purpose &amp; Scope
This plan describes how WBMSG continues to deliver service and recovers from incidents that disrupt normal operations. It covers all production systems hosted in AWS ap-south-1, the corporate office, and all critical business processes. Conformance reference: ISO 22301:2019 §8.4 (Business Impact Analysis) and §8.5 (Recovery Strategies).
## 2. Definitions

| Term | Meaning |
| --- | --- |
| BIA | Business Impact Analysis — quantifies the impact of disruption to each process |
| RTO | Recovery Time Objective — maximum acceptable time to restore service |
| RPO | Recovery Point Objective — maximum acceptable data loss measured in time |
| MTPD | Maximum Tolerable Period of Disruption — point beyond which company viability is at risk |
| DR | Disaster Recovery — technical recovery of systems |
| BCP | Business Continuity Plan — broader continuity of business operations (people, premises, suppliers, IT) |
| Incident Commander | Single decision-maker for an active incident |

## 3. Business Impact Analysis (BIA)
The BIA below identifies critical business processes, the systems that support them, and the maximum acceptable downtime.

| Business Process | Supporting System | RTO | RPO | MTPD |
| --- | --- | --- | --- | --- |
| Inbound WhatsApp message ingestion | Webhook + Postgres + Redis | 15 min | 0 (no loss) | 1 h |
| Outbound WhatsApp messaging | Send API + Meta connector | 15 min | 0 | 2 h |
| Agent inbox UI | Next.js + Postgres | 30 min | 5 min | 4 h |
| AI agent processing | OpenAI/Anthropic + RAG | 1 h | 5 min | 8 h |
| Billing and payments | Stripe + Razorpay + Postgres | 2 h | 5 min | 24 h |
| Reporting &amp; analytics | ClickHouse + dashboard | 4 h | 1 h | 72 h |
| Customer support tooling | Intercom + internal admin | 4 h | 1 h | 72 h |
| Public marketing site | Vercel-hosted Next.js | 2 h | 0 | 24 h |
| Internal HRIS / Finance | SaaS (Zoho People + Tally) | 8 h | 24 h | 5 BD |

## 4. Threat Scenarios
### 4.1 Tier-1 Scenarios (require dedicated runbook)
- AWS ap-south-1 region-wide outage &gt; 60 min.
- Database primary failure (Supabase managed Postgres).
- Meta WhatsApp Cloud API outage or rate-limit storm.
- Authentication provider (Clerk) outage &gt; 15 min.
- Ransomware / data-encryption attack on internal corporate systems.
- Data corruption due to bad migration or human error.
- DDoS or sustained malicious traffic against public endpoints.
- Key-personnel unavailability (CTO, Security Lead, on-call SRE).
### 4.2 Tier-2 Scenarios
- Single AZ failure within ap-south-1 (auto-mitigated by multi-AZ design).
- Vercel edge outage (failover to direct-to-API).
- Sub-processor outage (OpenAI, Stripe, Datadog) — degraded mode acceptable.
- Office unavailability (fire, flood, civil unrest) — fully remote operating mode.
- Pandemic — extended remote operating mode with travel restriction.
## 5. Recovery Strategy
### 5.1 Architecture for Continuity
- Multi-AZ deployment in ap-south-1 (3 AZs) for compute, database, and cache.
- Cross-region replication to ap-south-2 (Hyderabad): hourly snapshot + WAL streaming.
- All stateful services use managed offerings with documented RTO/RPO from the provider.
- Stateless services auto-recover via Kubernetes / Vercel reconciliation.
- Backup snapshots tested monthly via automated restore-and-verify job.
### 5.2 Region Failover (Tier-1 Region Outage)
1. Detection: &gt; 5 min total unavailability of ap-south-1 confirmed by status.aws.amazon.com and internal probes.
1. Decision: Incident Commander invokes 'Region Switch' runbook; CTO sign-off.
1. DNS cutover (Cloudflare): WBMSG.in routes to ap-south-2 endpoints (TTL 60 s).
1. Database promotion: ap-south-2 read-replica promoted to primary; WAL position recorded.
1. Verification: smoke test passes; PagerDuty cleared; status page updated.
1. Communication: status page + email to all customers within 30 min of decision.
### 5.3 Database Recovery (Single-Region)
1. Detection: replication lag &gt; 60 s OR primary unreachable for 30 s.
1. Automatic failover via Supabase managed; no manual action expected.
1. If automatic failover fails, manual recovery from latest snapshot (RPO ≤ 5 min).
1. Verification: row counts match expected ranges; transactional smoke test green.
### 5.4 Backup &amp; Restore
- Postgres: continuous WAL + 5-min snapshots, retained 35 days.
- Object storage: versioning enabled, 35-day retention, lifecycle to Glacier after 90 d.
- Code &amp; infrastructure: GitHub (mirrored to GitLab nightly).
- Secrets: AWS Secrets Manager + monthly export to encrypted offline backup.
- Restore-and-verify drill: monthly automated, quarterly tabletop.
## 6. Roles &amp; Responsibilities

| Role | BCP Responsibility |
| --- | --- |
| CEO | Final external-comms approval; declares 'crisis' status to Board |
| CTO | Technical authority; signs off region failover; chairs post-event review |
| Head of Platform / SRE Lead | Owns runbooks and the DR drill calendar; primary on-call commander |
| Security Lead | Co-commander for security-driven incidents; manages forensic capture |
| Head of Customer Success | Owns customer comms templates and CSM execution |
| DPO | Privacy notification (DPDP Board, GDPR LSA, principals) per breach trigger |
| Head of People (HR) | People safety, alternative work arrangements, family liaison |
| Head of Finance | Vendor payments continuity, insurance claim coordination |
| Office Manager | Premises continuity (alternate venue, supplies, communications) |

## 7. Activation &amp; Escalation
1. Any P1 incident triggers PagerDuty page to on-call SRE + Security Lead.
1. On-call evaluates within 5 min; declares 'BCP Activation' if scenario maps to §4.
1. BCP Activation pages: CTO, Head of CS, DPO (if data exposure), CEO (if external impact).
1. Incident Commander appointed (defaults to on-call SRE; CTO may reassign).
1. Bridge call (Zoom #war-room) opened; status logged in #incident-&lt;id&gt; Slack channel.
1. Customer comms drafted within 30 min; status page updated.
1. Resolution declared by Incident Commander after smoke tests pass and root cause identified or contained.
## 8. Communication Plan
### 8.1 Internal

| Audience | Channel | Cadence | Owner |
| --- | --- | --- | --- |
| On-call team | Slack #incident-&lt;id&gt; | Live updates | Commander |
| Engineering org | Slack #eng-incidents | Every 30 min | Commander |
| Executive Team | Email + Slack #exec | Every 60 min | CTO |
| Board | Email summary | On Tier-1 declaration + close | CEO |
| All Hands | Slack #general | On resolution + post-mortem | CEO/CTO |

### 8.2 External

| Audience | Channel | Cadence | Owner |
| --- | --- | --- | --- |
| Affected customers | In-app banner + email | Within 30 min of decision; updates every 60 min | CS |
| All customers | status.WBMSG.in | Real-time | Commander |
| Media / public | Press statement | Only on Tier-1 with material impact | CEO + Marketing |
| Regulators (DPDP Board) | Formal notification | Within 72 h of awareness, if data affected | DPO |
| Insurance carrier | Notification | Within 24 h of declaration | Finance |

## 9. People &amp; Premises Continuity
- All employees can work remotely; corporate VPN + SSO enforced.
- Office in Bengaluru; alternate venue MoU with WeWork (Marathahalli + Koramangala).
- Pandemic plan: full remote within 24 h; no critical process depends on physical presence.
- Family safety check: HR initiates if event affects an employee's geography.
- Succession: every role has a documented backup; CTO/CEO succession reviewed by Board annually.
## 10. Supplier Continuity
- Critical vendors: AWS, Supabase, Vercel, Clerk, Meta, Stripe, Razorpay, Datadog.
- Each contract includes uptime SLA, data portability clause, and service credits.
- Alternate provider identified for each (e.g., Clerk → Auth0; Stripe → Paypal/Razorpay).
- Annual vendor risk review by Procurement + Security Lead; results in Risk Register.
## 11. Testing &amp; Drills

| Test | Frequency | Owner | Pass Criteria |
| --- | --- | --- | --- |
| Backup restore (automated) | Weekly | SRE | Smoke test green |
| Single-AZ failover | Monthly | SRE | RTO &lt; 5 min, RPO 0 |
| Region failover (game day) | Quarterly | Platform Lead | RTO &lt; 60 min, RPO ≤ 5 min |
| Tabletop incident exercise | Quarterly | Security Lead | All roles complete drill, gaps logged |
| Pandemic / remote-only drill | Annually | HR | 100% workforce productive in 24 h |
| Full BCP audit | Annually | External (BSI) | ISO 22301 conformance |

- Each test produces a written report stored in Confluence &gt; Platform &gt; DR.
- Failures generate corrective action with owner and due date; tracked in Risk Register.
## 12. Insurance &amp; Legal
- Cyber liability cover: INR 50 Cr for breach response, regulatory fines, business interruption.
- Errors &amp; Omissions: INR 20 Cr for SLA-breach claims.
- General liability: INR 5 Cr for premises and third-party claims.
- Director &amp; Officer liability: INR 25 Cr.
- Annual review by CFO + Legal at policy renewal.
## 13. Plan Maintenance
- Quarterly review by Platform Lead and Security Lead; sign-off by CTO.
- Triggered review on: significant architecture change, new region, new critical vendor, lessons-learned from incident or drill.
- Plan distributed to: CEO, CTO, all engineering managers, DPO, CS Head, HR Head.
- Version-controlled in Confluence; printed copy in office safe.
## 14. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | Platform Lead | Baseline ISO 22301-conformant plan |

End of DR &amp; BCP | WBMSG v1.0 | April 2026 | ISO 22301:2019