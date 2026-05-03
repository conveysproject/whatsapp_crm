# WBMSG
# Operations Runbook &amp; SOPs
ITIL 4 Service Operation — Standard Operating Procedures
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
SRE Lead / Platform Lead
## 1. Purpose &amp; Scope
This runbook is the day-to-day operations manual for SRE and on-call engineers. Each SOP is a step-by-step procedure that any qualified engineer can execute without escalation. SOPs are version-controlled, tested in drills, and updated within 5 BD of any change.
## 2. How to Use This Document
- Find the SOP that matches the situation by index or full-text search.
- Read the entire SOP before starting; do not skip steps.
- If the SOP does not match the situation exactly, escalate via §17 rather than improvising.
- Update the SOP via PR within 5 BD if you find a step is wrong, missing, or outdated.
## 3. Service Map (Quick Reference)

| Service | Repo | Runtime | Datastore | Owner Pod |
| --- | --- | --- | --- | --- |
| api-gateway | WBMSG/api-gateway | Node.js 22 / Vercel | Postgres + Redis | Platform |
| inbox-svc | WBMSG/inbox | Node.js 22 / Vercel | Postgres + Redis | Backend |
| meta-connector | WBMSG/meta-connector | Node.js 22 / Fly.io | Postgres + Kafka | Backend |
| webhook-relay | WBMSG/webhook-relay | Node.js 22 / Vercel | Postgres outbox | Platform |
| campaigns-svc | WBMSG/campaigns | Node.js 22 / Vercel | Postgres + Redis | Backend |
| ai-orchestrator | WBMSG/ai-orch | Node.js 22 / Vercel | Postgres + Vector DB | AI |
| analytics-svc | WBMSG/analytics | Python 3.12 / Lambda | ClickHouse | Data |
| billing-svc | WBMSG/billing | Node.js 22 / Vercel | Postgres | Backend |
| web-app | WBMSG/web | Next.js 15 / Vercel | — | Frontend |

## 4. Daily Operational Checks
### 4.1 Morning Health Check (08:30 IST, Mon–Fri)
1. Open Datadog overview dashboard. Confirm: error rate green, latency green, error budget burn within plan.
1. Open status.WBMSG.in. Confirm all services 'Operational'.
1. Review overnight PagerDuty incidents. Acknowledge and triage any open.
1. Check the Renovate dashboard for pending dependency PRs flagged 'security'.
1. Skim #ops-alerts and #sec-alerts for unactioned alerts. Triage to JIRA.
1. Post a one-line summary in #sre-standup.
### 4.2 Weekly Capacity Review (Mon 10:00 IST)
- Review CPU, memory, DB connections, queue depth trends week-over-week.
- Flag any service &gt; 70% sustained on any resource — open capacity ticket.
- Verify auto-scale floor/ceiling appropriate for week's expected traffic (e.g., campaign send-day).
- Update capacity dashboard commentary.
### 4.3 Monthly Backup Verification
- Trigger restore-and-verify job for last week's snapshot to staging.
- Smoke-test restored DB: row counts, sample queries on critical tables.
- Document result in Confluence; failure raises an INC.
## 5. SOP-001 — Deploy Hotfix to Production
1. Confirm authority: IC must have declared incident OR EM/CTO sign-off in writing (Slack thread).
1. Branch from current production tag: git checkout -b hotfix/INC-&lt;id&gt; production.
1. Apply minimal patch to fix root cause; add or update a regression test.
1. Open PR labelled 'hotfix'; CI runs full pipeline; one peer must approve.
1. Tag release: git tag prod-&lt;YYYY-MM-DD&gt;-&lt;seq&gt;.
1. Trigger production deploy via GitHub Actions workflow 'Deploy / Production'.
1. Watch Datadog APM for 15 min post-deploy; abort and rollback on regression.
1. Update incident channel with deploy SHA and verification result.
1. Within 2 BD: open follow-up PR with full review, expanded tests, and changelog entry.
## 6. SOP-002 — Roll Back a Bad Production Deploy
1. Confirm regression: error rate or latency past SLO; user reports correlate.
1. Decision: code-only? rollback. Schema-touched? forward-fix (rollback rarely safe).
1. For Vercel: vercel rollback &lt;previous-deployment-id&gt; (or use UI).
1. For backend services on Argo CD: argocd app rollback &lt;app&gt; &lt;revision&gt;.
1. Verify recovery: dashboards return to green within 10 min.
1. Post in #incident-&lt;id&gt;: 'Rolled back to &lt;SHA&gt;; recovery verified at &lt;time&gt;.'
1. Open JIRA INC-&lt;id&gt; with link to PR that introduced the regression.
## 7. SOP-003 — Database Failover (Manual)
1. Verify primary unreachable for ≥ 30 s; check Supabase status page.
1. If automatic failover did not occur, page Database-on-call (Supabase support).
1. Promote replica via Supabase console: Project → Database → Replication → Promote ap-south-1b replica.
1. Update application config: connection string switches to new primary (Terraform-managed; apply within 5 min).
1. Verify writes resume: tail Datadog log for INSERT spans on /api/v1/messages.
1. Communicate: status page + #incident-&lt;id&gt; updates every 15 min.
1. Post-failover: new replica must be configured before declaring resolved.
## 8. SOP-004 — Restore Database from Snapshot
1. Determine target time: get RPO requirement and earliest acceptable timestamp.
1. Spin up restore instance in Supabase: Project → Database → Backups → Point-in-time → Restore.
1. Wait for restore (typically 10–30 min depending on size).
1. Validate: connect to restore-&lt;id&gt;.supabase.co; row counts on top 10 tables match expected.
1. Cut over (only with EM + IC approval): swap connection string in Vercel env + Terraform; redeploy.
1. Old primary archived for forensics, never deleted within 14 d.
## 9. SOP-005 — Rotate AWS KMS Customer-Managed Key
1. Schedule rotation in change calendar (Tue/Wed window).
1. AWS Console → KMS → Customer managed keys → tcrm-data-cmk → Key rotation → enable annual auto-rotate (already on).
1. For manual rotation: aws kms create-key alias, update Terraform module, terraform apply.
1. Validate: re-encrypt sample data via KMS API; smoke-test all services that use the key.
1. Decommission previous key version after 30-day re-encrypt window.
1. Audit log entry; report to Security Lead.
## 10. SOP-006 — Add a New Engineer to On-Call Rotation
1. Pre-requisites: completed onboarding, 30 days in role, paired-shadow ≥ 2 incidents, runbook quiz pass.
1. EM creates JIRA OPS-&lt;id&gt; 'On-call onboarding for &lt;name&gt;'.
1. PagerDuty: add user to 'SRE primary' rotation, starting next month.
1. Slack: add to #oncall-sre, #incident-template, #sec-alerts.
1. Issue Yubikey + LastPass enterprise vault access.
1. Confirm laptop has: VPN, Datadog CLI, kubectl, Vercel CLI, Argo CLI, gh, terraform.
1. First on-call shift: pair with senior for first 24 h.
1. Remove from rotation if any P1 mishandled in first 30 d; re-onboard.
## 11. SOP-007 — Process a DSAR (Data Subject Access Request)
1. Receive request via dpo@WBMSG.in or in-product form.
1. DPO logs in DSAR Register with received-date and 30-day deadline.
1. Verify identity: SSO session for account holders; 2-factor (email + phone or government ID) for third parties.
1. Engineering on-call runs export script: scripts/dsar_export.py --user &lt;id&gt;.
1. Output reviewed by DPO for completeness and any third-party data redaction.
1. Encrypted ZIP delivered via secure link; password sent on different channel.
1. Close ticket; record resolution date in DSAR Register.
1. Acknowledge within 1 BD; resolve within 30 calendar days.
## 12. SOP-008 — Process a Right-to-Erasure Request
1. DPO verifies request authenticity (same as SOP-007).
1. Engineering on-call runs scripts/dsar_erase.py --user &lt;id&gt; --dry-run; review report.
1. EM/IC reviews dry-run; confirms no statutory retention applies.
1. Re-run without --dry-run; the script soft-deletes within 1 h, hard-deletes after 30 d.
1. Crypto-shred associated KMS keys for backup blobs encrypting the user's data.
1. Confirmation email to data principal within 30 calendar days; record in DSAR Register.
## 13. SOP-009 — Investigate a Suspected PII Leak in Logs
1. If reporter is external, treat as security incident (page Security Lead).
1. Identify the offending log line in Datadog; note service, env, message ID range.
1. Estimate exposure: who has Datadog read access for the affected scope?
1. Apply log-redaction rule via Datadog Log Pipeline → 'PII redaction'.
1. Open PR to fix structured-log call site; add unit test asserting PII fields not serialised.
1. Backfill: purge affected log range with Datadog purge API (requires Security Lead approval).
1. DPO assesses notification trigger; if breach criteria met, follow §10 of Data Privacy Policy.
## 14. SOP-010 — Onboard a New Sub-Processor (Tier-1)
1. Engineering owner files Vendor Brief (Confluence template): purpose, data accessed, alternatives considered.
1. Security Lead reviews: SOC 2 / ISO 27001 attestation, sub-processors of the vendor, data residency.
1. DPO reviews: DPA in place, lawful basis, GDPR/DPDP compatibility, transfer mechanism.
1. Legal reviews contract; CFO approves spend.
1. Add to sub-processor list page (WBMSG.in/security/subprocessors); 30-day customer notice email.
1. Implement integration with feature flag default-off; ramp per Change &amp; Release plan.
## 15. SOP-011 — Recover from Webhook Outbound Storm
1. Detection: outbound queue depth &gt; 50K OR receiver-error rate &gt; 20% for 5 min.
1. Throttle: lower outbound rate to 10 msg/s/customer via runtime config (LaunchDarkly).
1. Identify failing receivers: Datadog query group by tenant, status_code.
1. Auto-pause webhook for tenants with &gt; 90% errors over 30 min; CS notifies the customer.
1. Resume after the customer confirms receiver fixed; manually replay backlog or auto-retry.
1. Post-mortem if storm exceeded 30 min or affected &gt; 10 tenants.
## 16. SOP-012 — Quarterly DR Game Day
1. Two weeks prior: SRE Lead schedules; chooses scenario from §4.1 of DR/BCP.
1. One week prior: assemble team (IC, comms, scribe, observers); brief expected scenario.
1. Day of: announce in #ops 'Game Day starting'; non-prod region or read-replica targeted.
1. Execute scenario; participants follow runbooks; observers note deviations.
1. Hot wash within 2 h: gaps captured.
1. Written report within 5 BD; action items entered in JIRA OPS project.
1. Re-run scenario in 6 months if any RTO/RPO miss.
## 17. Escalation Rules
- If SOP step fails twice or unexpected error: stop and page senior on-call.
- If situation does not match any SOP: declare 'novel incident', open #incident-&lt;id&gt;, page IC pool.
- Never bypass approvals to 'just fix it' — emergency change procedure exists for that.
- When in doubt, escalate. The cost of a false escalation is small; the cost of a missed P1 is large.
## 18. Tools Reference

| Tool | Purpose | Auth |
| --- | --- | --- |
| Datadog | Metrics, APM, Logs, Synthetics | SSO via Clerk |
| PagerDuty | Alerting, on-call schedules | SSO |
| Vercel CLI | Frontend deploys, env mgmt | vercel login |
| Argo CD | Backend deploys | SSO + Yubikey |
| Terraform Cloud | Infra changes | SSO + Yubikey |
| AWS Console | IAM, KMS, S3, CloudWatch | SSO with break-glass MFA |
| Supabase Dashboard | DB ops, replication | SSO |
| Statuspage.io | Public status comms | SSO |
| Incident.io | Incident lifecycle, RCA template | SSO |
| Confluence | Runbook, RCA archive | SSO |

## 19. Maintenance of this Runbook
- Each SOP has an owner (named in the SOP header in Confluence; this print is a snapshot).
- Quarterly review by SRE Lead; mark stale SOPs for retirement.
- After every incident with an SOP gap, an SOP update PR is opened within 5 BD.
- Every new engineer must execute one SOP under supervision in their first 30 days.
## 20. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | SRE Lead | Initial set of 12 SOPs |

End of Operations Runbook &amp; SOPs | WBMSG v1.0 | April 2026 | ITIL 4