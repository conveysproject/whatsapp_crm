# WBMSG
# Change &amp; Release Management Plan
ITIL 4 Change Enablement + SOC 2 CC8 (Change Management)
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
VP Engineering / SRE Lead
## 1. Purpose &amp; Scope
This plan defines how every change to WBMSG production is proposed, reviewed, approved, deployed, verified, and audited. It applies to application code, configuration, database schema, infrastructure, third-party integrations, and operational runbooks. It satisfies SOC 2 Common Criteria CC8.1 (change management).
## 2. Definitions

| Term | Meaning |
| --- | --- |
| Change | Any modification to production state |
| Standard Change | Pre-approved low-risk change executed via repeatable runbook |
| Normal Change | Default path: PR → review → CI → deploy |
| Emergency Change | Required to restore service; expedited path with post-hoc review |
| Release | A bundled set of changes deployed together at a planned moment |
| Hotfix | An out-of-cycle release that addresses a P1/P2 incident |
| Freeze | A defined window during which no Normal Changes are deployed |
| CAB | Change Advisory Board (ITIL) — for high-risk or strategic changes |

## 3. Change Categories &amp; Risk

| Category | Examples | Approval | Window |
| --- | --- | --- | --- |
| Standard (low risk) | Feature flag flip; cache TTL adjust; documentation | Engineer + CI green | Anytime business hours |
| Normal (medium risk) | Most application code; DB index add; library bump | PR ≥1 reviewer + CI | Mon–Thu 09:00–17:00 IST |
| High-risk | DB schema migration; auth flow change; pricing logic | PR ≥2 reviewers (incl. tech-lead) + Security Lead if applies | Tue–Wed 10:00–15:00 IST |
| Emergency / hotfix | Restore P1/P2 outage | Two-engineer dual approval, IC sign-off, CTO if no IC | Anytime, post-hoc review |

## 4. Workflow — Normal Change
1. Engineer creates branch from main (trunk-based; short-lived branches preferred).
1. PR opened with description, screenshots, test evidence; PR template completed.
1. Reviewer(s) examine: correctness, security, observability hooks, tests, docs.
1. CI must pass: unit + integration + E2E + SAST + SCA + container scan + bundle-size check.
1. Reviewer approves; merge to main triggers automated deploy to staging.
1. Smoke test green on staging → automated promotion to production (canary 5% → 50% → 100% over 30 min).
1. Datadog monitors during canary; auto-rollback on error-rate or latency regression.
1. Engineer signs off in PR; release notes auto-appended to /releases.
## 5. Workflow — High-Risk Change
1. Author writes a Change Brief (template) — purpose, blast radius, rollback plan, comms.
1. Reviewers (≥2) scrutinise; Security Lead reviews if security/privacy touched.
1. Schedule the deploy in the change calendar (Tue/Wed window).
1. Pre-deploy comms: Slack #releases, customer-facing comms if customer-impacting.
1. Deploy with feature flag default-off; phased ramp (5% → 25% → 100% with 24 h soak between phases).
1. Post-deploy verification: dashboards, sample-customer test, on-call ack.
1. If issue detected → ramp-down; root-cause within 1 BD; new change for re-attempt.
## 6. Workflow — Emergency / Hotfix
1. Triggered by P1/P2 incident; IC declares need.
1. Hotfix branch from production tag; minimal diff to fix root cause.
1. Two-engineer dual approval (IC + author), CI must pass.
1. Direct deploy to production; staging skip permitted with IC sign-off.
1. Post-deploy: verify resolution + capture timeline.
1. Post-hoc review within 2 BD with full PR review and any backfill tests.
1. Logged in Emergency Change Register; reviewed monthly by VP Eng.
## 7. Database Changes
- All migrations must be forward-compatible (zero-downtime) with prior release.
- Two-phase deploys for breaking schema: (a) additive change deployed and verified; (b) consumer rewrite; (c) cleanup of old column/table after one full release cycle.
- Migrations idempotent and reversible where feasible; reversal script documented.
- Long-running migrations (&gt; 5 min) executed in a maintenance window with notice.
- Tested on a production-sized dataset in staging before merge.
## 8. Feature Flags
- Manage via LaunchDarkly (or equivalent) — every non-trivial feature flag-gated.
- Flag has an owner and an expiry; expired flags audited monthly.
- Default value documented; flip-back procedure tested.
- Killswitch for any AI feature — disable per-org via flag in &lt;5 min.
## 9. Release Calendar &amp; Freeze Windows
- Standard release window: Tue/Wed 10:00–15:00 IST (high-risk).
- Freeze: 24 h before any planned demo/launch; full week before holiday-eve (Diwali, year-end).
- Customer-announced freezes: 30-day notice before SOC 2 audit window.
- Freeze does not block hotfixes (with dual approval).
## 10. Approval Authority

| Change Type | Author | Reviewer(s) | Approver |
| --- | --- | --- | --- |
| Standard | Any engineer | CI gates | Self |
| Normal | Any engineer | 1 peer | Reviewer |
| High-risk | Senior engineer | 2 peers + Tech Lead | Tech Lead + Security Lead (if applicable) |
| Schema migration | Any engineer | Tech Lead + DBA-on-call | EM |
| Pricing / billing | Backend engineer | Tech Lead + Finance Ops | VPE |
| Auth / tenant isolation | Senior engineer | Tech Lead + Security Lead | Security Lead + EM |
| Emergency | Any engineer | 1 peer (IC if active) | IC + CTO (post-hoc) |

## 11. Configuration Changes
- All configuration in code (Terraform / GitHub-stored YAML / LaunchDarkly with audit log).
- Manual cloud-console changes prohibited except in declared emergencies (logged within 1 BD).
- Drift detection: Terraform plan runs nightly; any drift opens a JIRA ticket.
## 12. Third-Party Dependency Changes
- Renovate bot opens PRs for dependency updates daily.
- Patch versions: auto-merge if CI green and changelog clean.
- Minor / major: human review; security advisories prioritised.
- License check: prohibited licenses (AGPL on backend services) auto-block.
## 13. Change Documentation
- Every PR has a description that becomes the change record.
- Auto-generated CHANGELOG.md aggregated by Renovate / Release-it.
- Customer-facing changes: release notes published in product (in-app changelog) and on /changelog.
- Post-merge: merge commit message links the PR and the JIRA ticket.
## 14. Rollback
- Every change must have a documented rollback strategy in the PR.
- Default for code: redeploy previous tag (Vercel revert or k8s rollback) — &lt; 2 min.
- Default for data: forward-fix migration (rollback rarely safe for data); restore from snapshot only as last resort.
- Rollback decision authority: on-call SRE for code; IC + EM for data; CTO for schema reverts.
## 15. Audit &amp; SOC 2 Evidence
- Every production deploy logged in immutable audit log (GitHub Actions + Vercel + Datadog).
- Quarterly sample of 25 PRs audited by Security Lead for control conformance.
- Findings tracked in Risk Register; sample size grows if non-conformance found.
- Annual SOC 2 control walk-through with auditor.
## 16. Metrics

| Metric | Definition | Target |
| --- | --- | --- |
| Deployment Frequency | Production deploys per week per service | ≥ 5 |
| Lead Time for Changes | Commit → production p50 | ≤ 24 h |
| Change Failure Rate | Deploys causing P1/P2 within 24 h | ≤ 5% |
| MTTR for failed deploy | Time to rollback after detection | ≤ 15 min |
| PR review time p50 | PR open → first review | ≤ 4 h business hours |
| Hotfix ratio | Emergency deploys / total deploys | ≤ 5% |

## 17. Tooling Stack
- Source: GitHub (mirrored to GitLab nightly).
- CI: GitHub Actions; required checks enforced via branch protection.
- CD: Vercel for frontend; Argo CD for backend; Terraform Cloud for infra.
- Feature flags: LaunchDarkly.
- Secrets: AWS Secrets Manager (production); Vercel Env (staging).
- Observability: Datadog APM/Logs/RUM; Sentry; Statuspage.io.
## 18. Roles &amp; RACI
- Author — responsible for change quality, tests, docs.
- Reviewer — accountable for review quality; can decline approval.
- Tech Lead — accountable for architectural fit and high-risk approval.
- Security Lead — consulted for security/privacy-sensitive changes.
- SRE on-call — informed of all production deploys; approves emergency.
- EM — accountable for the team's overall change quality and metric trends.
- VP Engineering — accountable for organisation-wide compliance and metrics.
## 19. Continuous Improvement
- Monthly DORA-metric review at engineering all-hands.
- Each post-mortem produces actions that are tagged 'change-process' if relevant.
- Annual external review of change controls by SOC 2 auditor.
## 20. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | VP Engineering | Baseline at end of Sprint 0; SOC 2 CC8 mapping complete |

End of Change &amp; Release Management Plan | WBMSG v1.0 | April 2026 | ITIL 4 + SOC 2 CC8