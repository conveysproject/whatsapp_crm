# Release Governance Plan — TrustCRM GA

> **Date:** 2026-05-18 | **GA Target:** April 2026

---

## Release Process

### Standard Release (Cycle Deliverable)

**Frequency:** Every 4 weeks (end of each cycle)

**Steps:**
1. **Code freeze** — 2 days before release
   - All feature PRs must be merged
   - No new features in code freeze window
   - Bug fixes only

2. **QA pass** — 1 day before release
   - Run full Vitest suite: `pnpm test` — must be 0 failures
   - Run E2E suite: `pnpm exec playwright test` — must pass all P0 specs
   - Verify `pnpm type-check` — 0 errors
   - Verify `pnpm lint` — 0 errors

3. **Staging deploy** — 1 day before release
   - Deploy to Railway staging environment
   - Run smoke tests against staging
   - Verify `GET /health` returns 200

4. **Release sign-off** — morning of release
   - Engineering Lead reviews: all tests pass, no open P0 bugs
   - Product Lead reviews: acceptance criteria met for cycle deliverables
   - Sign-off logged in release notes doc

5. **Production deploy** — release day
   ```bash
   git tag v<major>.<minor>.<patch>
   git push origin v<major>.<minor>.<patch>
   # Railway auto-deploys from main branch
   # Vercel auto-deploys from main branch
   ```

6. **Post-deploy verification** — 30 min after deploy
   - `GET /health` returns 200
   - No spike in Datadog error rate
   - Test message sends successfully
   - Key E2E flows pass against production

7. **Release notes** — same day
   - Commit `CHANGELOG.md` with Conventional Commits summary

---

### Hotfix Release (P0 Bug in Production)

**Response SLA:** Hotfix must be deployed within 4 hours of P0 confirmation.

**Steps:**
1. Create hotfix branch: `git checkout -b hotfix/TRUST-XXX-description`
2. Minimal fix — no other changes
3. Engineer review (second set of eyes required for hotfix)
4. Run affected tests only: `pnpm --filter @WBMSG/api test -- --reporter=verbose`
5. Deploy immediately — no code freeze
6. Post-mortem within 24 hours

---

## Version Numbering

| Version | Meaning |
|---------|---------|
| `1.x.x` | Pre-GA — active development |
| `1.0.0` | First GA release |
| `1.0.x` | Patch: bug fixes only |
| `1.x.0` | Minor: new features |
| `2.0.0` | Major: breaking API changes (increment after full WhatsJet parity) |

---

## Feature Flag Governance

New features in Cycle 3+ should ship behind feature flags:

```bash
# Enable feature for specific org
railway variable set FF_RAZORPAY="org-uuid-1,org-uuid-2"

# Enable feature for all orgs
railway variable set FF_RAZORPAY="*"

# Disable feature
railway variable set FF_RAZORPAY=""
```

**Feature flag naming convention:** `FF_<FEATURE_NAME>` in all caps.

**Current feature flags to create:**
| Flag | Feature | Default |
|------|---------|---------|
| `FF_RAZORPAY` | Razorpay payment gateway | disabled |
| `FF_INTERACTIVE_MESSAGES` | Interactive message types | disabled |
| `FF_SUPERADMIN` | SuperAdmin console | disabled |
| `FF_EXTERNAL_API` | Partner API with API keys | disabled |

---

## GA Approval Process

**GA release requires sign-off from:**

| Stakeholder | Criteria | Sign-off Date |
|------------|---------|--------------|
| Engineering Lead | All P0 checklist items pass; `pnpm test` 100% green | ⬜ |
| QA Lead | All regression suites pass; E2E smoke tests pass | ⬜ |
| Product Lead | All P0 + P1 feature gaps resolved | ⬜ |
| Security | OWASP scan clean; RLS isolation verified | ⬜ |
| Legal | Privacy policy live; GDPR compliance confirmed; India DPDP reviewed | ⬜ |
| CTO | Executive migration dashboard score ≥ 90%; all CRITICAL risks resolved | ⬜ |

**GA is BLOCKED until ALL sign-offs collected.**

---

## Change Management

### Communication

| Audience | Channel | Frequency |
|---------|---------|----------|
| Engineering team | `#engineering` Slack | Each PR merge |
| Product / leadership | `#product` Slack + weekly status email | Weekly |
| Beta customers | In-app notification + email | Each cycle release |
| All customers (GA) | Email + in-app banner | GA day |

### Release Notes Template

```markdown
## TrustCRM v1.x.0 — YYYY-MM-DD

### What's New
- [Feature 1 — Module]: Description
- [Feature 2 — Module]: Description

### Fixed
- [BUG-123]: Description

### Known Limitations
- [GAP-001]: Labels API not yet available (coming in next release)

### Breaking Changes
- None
```

---

## Rollback Governance

All rollbacks require:
1. Incident channel created: `#incident-YYYY-MM-DD` in Slack
2. Engineering Lead notified within 5 minutes of detection
3. Rollback decision made within 15 minutes of detection
4. Post-mortem scheduled within 24 hours
5. Root cause documented in `docs/postmortems/`

See `docs/migration/12-rollback-strategy.md` for technical procedures.

---

*Owner: Engineering Lead | Approved by: CTO*
