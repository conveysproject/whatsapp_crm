# WBMSG
# Incident Management Plan
ITIL 4 Incident Management + SOC 2 CC7 (Operations &amp; Monitoring)
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Head of Platform / SRE Lead
## 1. Purpose &amp; Scope
This plan describes how WBMSG detects, classifies, responds to, communicates about, and learns from production incidents. It applies to all production systems, customer-facing services, and security incidents with operational impact. It satisfies SOC 2 Common Criteria CC7.3 (incident response) and CC7.4 (incident recovery).
## 2. Definitions

| Term | Meaning |
| --- | --- |
| Event | A detected change in state — may or may not be an incident |
| Incident | An unplanned interruption or degradation of a service |
| Major Incident (P1) | Severity-1 incident requiring immediate executive attention |
| Problem | The underlying cause of one or more incidents |
| Workaround | A temporary fix that restores service while root cause is investigated |
| Incident Commander (IC) | Single decision-maker for an active incident |
| Comms Lead | Person responsible for internal and external communications during the incident |
| MTTR | Mean Time to Recovery — average time from detection to resolution |
| RCA | Root Cause Analysis — written post-incident analysis |

## 3. Severity Matrix

| Sev | Definition | Examples | Page Owner | Customer Comms |
| --- | --- | --- | --- | --- |
| P1 | Critical: outage affecting &gt;5% of customers OR data exposure OR SLA breach | Region down; auth offline; data leak | On-call SRE + IC + CTO | Within 30 min on status page |
| P2 | High: significant degradation; &lt;5% customers OR a single Enterprise tenant | Inbox slow; campaign queue stuck | On-call SRE + EM | Within 60 min if impact &gt;30 min |
| P3 | Medium: localised; workaround exists | Specific webhook delivery delayed | On-call SRE | On request |
| P4 | Low: cosmetic / non-customer-impacting | Internal dashboard down | Best effort, business hours | None |

## 4. Detection
- Automated monitoring: Datadog APM, synthetic checks, log-pattern alerts.
- Customer reports via support channel, status page, or in-product 'Report a problem'.
- Internal reports via #sec-alerts (security) or #ops-alerts (operations) Slack.
- External reports via security@WBMSG.in (responsible disclosure).
- All sources funnel into PagerDuty as Events; PagerDuty applies dedup and severity routing.
## 5. Roles

| Role | Responsibility | Activation |
| --- | --- | --- |
| On-call SRE (primary) | First responder, triage, initial mitigation | P1-P4 |
| On-call SRE (secondary) | Backup; takes over after 2 h on the same incident | P1-P2 |
| Incident Commander (IC) | Single decision-maker; coordinates roles | P1, optional P2 |
| Comms Lead | Status page, customer email, exec updates | P1, optional P2 |
| Subject-Matter Experts | Pulled in by IC as needed | Per incident |
| Scribe | Maintains incident timeline in #incident-&lt;id&gt; channel | P1 |
| Customer Success Liaison | Speaks for affected customers; relays customer questions | P1, P2 with named-customer impact |
| Security Lead | Co-commander for security incidents; legal-evidence custody | P1 security incidents |
| DPO | Privacy-breach notification to regulators and principals | P1 with PII exposure |
| Executive Sponsor | External escalation, media, board notification | P1 sustained &gt; 60 min |

## 6. Lifecycle
### 6.1 Detect (0–5 min)
- Alert fires; PagerDuty pages on-call.
- On-call acknowledges within 5 min (paged again at 10 min if not).
- On-call opens #incident-&lt;id&gt; Slack channel; IC named (self if SEV ≥ 3, paged separately if P1).
### 6.2 Triage (5–15 min)
- Severity assigned per §3 matrix.
- Status page updated for P1; internal exec email if P1.
- IC decides: short rollback or forward fix?
### 6.3 Mitigate (Service-Restore)
- Apply workaround OR rollback to last good state.
- Verification via smoke test + dashboard return-to-normal.
- Customer comms updated (status page + targeted email if named impact).
### 6.4 Resolve
- All systems within SLO; customer reports cleared.
- Status page set to Resolved; final customer comms sent.
- Incident channel closed; full timeline archived to Confluence.
### 6.5 Review (≤ 5 BD)
- RCA published in Confluence using template (timeline, contributing factors, action items).
- P1: blameless post-mortem meeting within 5 BD; CTO attends.
- Action items have owner + due date; tracked in JIRA INC-* project.
- Public post-mortem for any P1 with &gt; 15 min customer-facing impact: published within 10 BD on WBMSG.in/blog/postmortems.
## 7. Communication Templates
### 7.1 Status Page — Initial (T+30 min)
We are investigating reports of [SHORT_DESCRIPTION] affecting [SCOPE]. Our team is engaged. Next update by [TIME+30m].
### 7.2 Status Page — Update
Update: We have identified [CAUSE] and are deploying a [FIX/MITIGATION]. We expect resolution within [ETA]. Next update by [TIME+30m].
### 7.3 Status Page — Resolved
Resolved at [TIME]. The issue affected [SCOPE] for [DURATION]. Cause was [SHORT]. A full post-mortem will be published within 10 business days.
### 7.4 Customer Email — P1 with named-customer impact
Subject: WBMSG service incident — your account may be affectedHi [NAME],Between [START] and [END] IST today, [SCOPE] was [IMPACTED]. Your account [WAS / WAS NOT] within the affected scope.We are sorry for the disruption. We will publish a detailed post-mortem and any service credit calculation by [DATE].Best,[SENDER NAME], Head of Customer Success
## 8. On-Call &amp; Escalation
### 8.1 Rotation
- 24×7 follow-the-sun coverage from Sprint 18 (Series A funding).
- Pre-Sprint-18: business-hours primary + after-hours best-effort with PagerDuty page.
- Each rotation: 1 week, with a primary and secondary; max 2 weeks per month per engineer.
- Compensation: on-call allowance + 1 day off in lieu per consecutive weekend.
### 8.2 Escalation Tree
1. On-call (primary) → 5 min → re-page (secondary).
1. Secondary unack 10 min → page Engineering Manager.
1. EM unack 15 min → page VP Engineering.
1. VPE unack 20 min → page CTO.
1. Any P1 with sustained customer impact &gt; 60 min → CEO informed by IC.
## 9. Tooling
- PagerDuty: alerting, on-call schedules, escalation policies.
- Datadog: metrics, APM, logs, synthetic monitoring.
- Sentry: error tracking and release-attribution.
- Slack: #incident-&lt;id&gt; channels (auto-created by Incident.io).
- Incident.io: incident lifecycle automation, status page, post-mortem templates.
- Statuspage.io: public status page; embedded in WBMSG.in/status.
- Confluence: RCA archive; on-call runbooks.
- JIRA: INC-* incident tracker; post-mortem action items.
## 10. Special Cases
### 10.1 Security Incident (data exposure, unauthorised access)
- Security Lead becomes Co-IC; legal counsel notified.
- Forensic capture (no rollback that destroys evidence) before mitigation.
- DPO notified; breach-clock starts (DPDP 72 h, GDPR 72 h).
- Affected customers notified within 24 h regardless of confirmation.
### 10.2 Sub-processor Outage
- Vendor status page checked first; status mirrored on WBMSG status page.
- Failover to alternate (e.g., AI provider) initiated if RTO &lt; required.
- Vendor post-mortem requested; learnings folded into our DR plan.
### 10.3 Customer-Self-Inflicted
- If root cause is the customer's misconfiguration (webhook receiver down, etc.), CS leads remediation.
- WBMSG provides diagnostic data; not counted against SLA.
## 11. Metrics &amp; KPIs

| Metric | Definition | Target |
| --- | --- | --- |
| MTTA (Mean Time to Acknowledge) | From page to ack | ≤ 5 min for P1 |
| MTTR P1 | From detect to resolve | ≤ 60 min |
| MTTR P2 | From detect to resolve | ≤ 4 h |
| MTTR P3 | From detect to resolve | ≤ 1 BD |
| Action item closure | % post-mortem actions closed within due date | ≥ 90% |
| Public post-mortem timeliness | % within 10 BD | ≥ 95% |
| Repeat incidents | Same root cause within 90 d | 0 |

## 12. Continuous Improvement
- Quarterly trend review by SRE Lead: top causes, MTTR distribution, action-item burndown.
- Annual chaos engineering programme (game days) targeting top failure modes.
- Incident learnings fold into runbook updates within 5 BD of each post-mortem.
## 13. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | SRE Lead | Baseline at end of Sprint 0; on-call programme defined |

End of Incident Management Plan | WBMSG v1.0 | April 2026 | ITIL 4 + SOC 2 CC7