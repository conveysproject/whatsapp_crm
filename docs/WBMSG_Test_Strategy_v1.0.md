# WBMSG
# Test Strategy &amp; QA Plan
## Quality Engineering Framework
Version 1.0 | April 2026
Strictly Confidential

| Document Owner | QA Lead / Director of Quality Engineering |
| --- | --- |
| Scope | All WBMSG products: web app, mobile app, API, ML services |
| Test Pyramid | 70% unit, 20% integration, 10% E2E |
| Coverage Target | ≥80% line coverage, 100% on critical paths |

# Table of Contents

# 1. Quality Philosophy
Quality at WBMSG is everyone&apos;s responsibility, not the QA team&apos;s job alone. Every engineer owns the quality of their work, and the QA function exists to amplify that ownership through tooling, process, and expertise.
## 1.1 Core Principles
Shift Left: Catch defects as early as possible — in design, code review, and unit tests, not in production.
Test Like a Customer: Test from the user&apos;s perspective, not just the code&apos;s perspective.
Automate Repetitive, Manual for Exploratory: Automate everything we&apos;d run more than 3 times. Use humans for exploration.
Fast Feedback: Tests must run quickly. A 30-minute test suite is broken even if it passes.
Trust the Tests: A flaky test is worse than no test. Fix or delete flakes immediately.
Production is the Ultimate Test Environment: Use feature flags, canary deploys, and observability to learn from production safely.
## 1.2 Definition of Quality
Quality at WBMSG means our software is:
Functionally correct:
Functionally correct: It does what we said it would do.
Reliable: It works consistently, not just under happy-path conditions.
Performant: It meets defined latency, throughput, and resource targets.
Secure: It protects user data and resists known attack patterns.
Accessible: It works for users with disabilities, on slow networks, on older devices.
Maintainable: Other engineers can understand and safely modify it.

# 2. Test Pyramid
Our testing investment follows the classic test pyramid: many fast unit tests at the base, fewer integration tests in the middle, and few but high-value end-to-end tests at the top.

| Layer | % of Tests | Avg Duration | Purpose |
| --- | --- | --- | --- |
| Unit Tests | 70% | &lt;10ms | Test individual functions, classes, components in isolation. Mock external dependencies. |
| Integration Tests | 20% | &lt;500ms | Test interactions between modules, real database, real Redis, mocked external APIs. |
| E2E Tests | 10% | &lt;30s | Full-stack tests through the UI, validating critical user journeys. |

## 2.1 Unit Tests
Tooling:
Backend: Vitest + supertest
Frontend: Vitest + React Testing Library
ML Service: pytest
Mobile: Jest + React Native Testing Library
What to Test:
Pure functions: input → output transformations
Business logic: validation rules, calculations, state machines
Components: render correctly given props, handle user events
Edge cases: nulls, empty arrays, boundary values, error conditions
What NOT to Test (in unit tests):
External APIs (Stripe, Meta, Claude) — mock these
Database queries — those belong in integration tests
Implementation details — test behavior, not internals

## 2.2 Integration Tests
Tooling:
Test runner: Vitest with longer timeouts
Real PostgreSQL via Testcontainers (isolated per test suite)
Real Redis via Testcontainers
Mocked external APIs via MSW (Mock Service Worker)
Critical Integration Test Scenarios:
API endpoint receives request → validates → writes to DB → returns response
Webhook from Meta → signature validation → message stored → real-time event published
Campaign created → BullMQ job enqueued → worker processes batch → all messages sent
Flow trigger fires → execution engine runs nodes → side effects happen correctly
RLS enforcement: User from Org A cannot read/write data from Org B
## 2.3 End-to-End Tests
Tooling:
Playwright for web E2E tests
Detox for mobile E2E tests
Test data fixtures, dedicated test organizations
Visual regression: Percy or Chromatic
E2E Test Suite (run on every release candidate):
New user signs up, creates org, connects WhatsApp, sends first message
Agent receives message, replies, conversation marked as resolved
Admin creates template, submits to Meta, template is approved (mocked), used in campaign
Admin builds segment of contacts with &apos;lead&apos; lifecycle stage, launches campaign, sees delivery analytics
Admin builds 3-step welcome flow, contact triggers it, all 3 messages sent in correct order
User changes role from Admin to Agent, can no longer access Settings

# 3. Specialized Testing
## 3.1 Performance Testing
Tooling: k6 for load testing, Lighthouse for frontend performance.
Cadence:
Smoke load tests: every staging deploy (verify API responds under nominal load)
Full load tests: weekly on staging, before each phase exit
Stress tests: monthly to find breaking points
Soak tests: every quarter (24-hour sustained load)
Performance Targets:

| Scenario | Target |
| --- | --- |
| API GET endpoint, 1000 concurrent users | p95 &lt; 300ms, error rate &lt; 0.1% |
| API POST endpoint, 500 concurrent writes/sec | p95 &lt; 800ms, error rate &lt; 0.5% |
| Webhook ingestion, 10,000 events/min | p99 &lt; 2s ingestion-to-DB, no message loss |
| Inbox page load (with 50,000 conversations) | LCP &lt; 2.5s, TTI &lt; 3.5s |
| Campaign launch (10,000 recipients) | All messages enqueued &lt; 30s, throughput 1000/min |

## 3.2 Security Testing
Static Analysis (SAST):
Semgrep + CodeQL on every PR (blocks merge on high-severity findings)
npm audit / pip-audit for dependency vulnerabilities, daily scan
Secret scanning: Gitleaks pre-commit hook + GitHub secret scanning
Dynamic Analysis (DAST):
OWASP ZAP scan against staging weekly
Tenant isolation tests: automated suite that attempts cross-org data access
Authorization tests: every API endpoint tested with each role
Penetration Testing:
Third-party VAPT: every 6 months and before major releases
Bug bounty program: launched alongside GA
Scope: web app, API, mobile app, infrastructure
## 3.3 Accessibility Testing
axe-core integrated into Playwright E2E tests (zero violations on critical pages)
Manual screen reader testing (VoiceOver, NVDA) every release
Keyboard-only navigation testing on every new feature
Color contrast checks built into design system Storybook
Target: WCAG 2.1 AA compliance

## 3.4 AI Feature Testing
AI features require non-traditional testing approaches because outputs are non-deterministic. We use a combination of property-based assertions, golden datasets, and continuous evaluation.
Smart Reply Testing:
Golden dataset: 500 real conversations with human-rated &apos;good&apos; replies
Each release tested against golden dataset, must hit ≥85% relevance score
Production sampling: 1% of replies rated by trained reviewers weekly
A/B framework: compare new prompts against current production prompt
Voice Transcription Testing:
Test set: 200 voice notes spanning 6 Indian languages, varying audio quality
Word Error Rate (WER) target: &lt;15% for clear audio, &lt;25% for noisy audio
Latency target: 60-second voice note transcribed in &lt;5 seconds (p99)
Prediction Model Testing:
Holdout test set with known outcomes (churn, LTV)
Churn model target: AUC ≥0.80 on test set
Drift monitoring: alert when production input distribution diverges from training
Model retraining cadence: monthly with rolling 90-day window

# 4. CI/CD Quality Gates
Every change passes through a series of automated quality gates before reaching production. Failing any gate blocks the deployment.
## 4.1 Pre-Merge Gates

| Gate | Pass Criteria | Blocks Merge? |
| --- | --- | --- |
| Lint + Format | Zero errors | Yes |
| Type Check | Zero errors | Yes |
| Unit Tests | 100% pass | Yes |
| Integration Tests | 100% pass | Yes |
| Code Coverage | ≥80% on changed files | Yes |
| Security SAST (Semgrep) | Zero high/critical | Yes |
| Dependency Audit | Zero high/critical CVEs | Yes |
| Bundle Size | Within 5% of baseline | Warning only |
| Code Review | ≥1 approval | Yes |

## 4.2 Pre-Production Gates
After merge to main, additional gates run before production deployment:
E2E test suite (full Playwright run on staging) — 100% pass
Smoke load test (k6 baseline scenarios) — within 10% of baseline
Visual regression — no unintended UI changes
Database migration dry-run — succeeds on staging
Manual QA sign-off (for high-risk changes only)
## 4.3 Production Gates
During and immediately after production deploy:
Health check endpoint returns 200 within 30 seconds of deploy
Error rate stays under 0.5% for 5 minutes post-deploy
p95 latency stays under threshold for 5 minutes post-deploy
Synthetic monitors continue passing
If any gate fails: automatic rollback within 60 seconds

# 5. Bug Management
## 5.1 Severity Levels

| Level | Definition | Examples | Response Time |
| --- | --- | --- | --- |
| P0 — Critical | Service down, data loss, security breach | API completely down, customer data exposed, mass message delivery failure | Immediate page-out; fix within 4 hours |
| P1 — High | Major feature broken, no workaround | Cannot send messages, cannot log in, billing broken | Same business day; fix within 24 hours |
| P2 — Medium | Feature degraded, workaround exists | Slow page load, intermittent errors, minor UI breakage | Fix within 1 week |
| P3 — Low | Minor issues, cosmetic problems | Typos, color inconsistencies, edge-case errors | Fix within 1 month or backlog |

## 5.2 Bug Reporting Workflow
All bugs filed in Linear with template: steps to reproduce, expected, actual, environment, severity
Bugs auto-routed to relevant pod based on labels
Pod tech lead triages within 1 business day, sets priority
P0/P1 bugs trigger Slack alert in #incidents channel
All bugs link back to user stories or production incidents that uncovered them
## 5.3 Bug Quality Metrics
Bug escape rate: % of bugs found in production vs caught pre-release (target: &lt;5%)
Mean time to detect (MTTD): how quickly we find production issues
Mean time to resolve (MTTR): how quickly we fix them
Reopen rate: % of bugs reopened after fix (target: &lt;10%)
Reported per release vs trending over time

# 6. Release Strategy
## 6.1 Deployment Cadence

| Environment | Cadence | Trigger |
| --- | --- | --- |
| Development | Continuous | Every commit to feature branch |
| Staging | Continuous | Every merge to main branch |
| Production | Multiple times per day | Manual promote from staging after green gates |

## 6.2 Deployment Strategy
Blue-Green Deployment:
Two identical production environments (blue and green)
New version deployed to inactive environment
Health checks and smoke tests run against new environment
Load balancer cuts traffic over once verified
Old environment kept warm for 30 minutes for instant rollback
Canary Releases (for high-risk changes):
Deploy to 5% of traffic first
Monitor error rate, latency, business metrics for 30 minutes
Gradually expand: 25% → 50% → 100% over 2 hours
Auto-rollback if any health metric crosses threshold
Feature Flags:
All customer-facing changes ship behind feature flags
Flags allow per-org rollout, percentage rollout, or instant kill switch
Tooling: LaunchDarkly or self-hosted Unleash
Flags removed within 30 days of full rollout (no permanent flags)

# 7. Quality Metrics &amp; Reporting
## 7.1 Quality KPIs

| Metric | Target | Why it matters |
| --- | --- | --- |
| Production Uptime (SLA) | ≥99.9% | Customer trust depends on reliability |
| Bug Escape Rate | &lt;5% | Indicates pre-release testing effectiveness |
| Test Coverage (line) | ≥80% | Foundation for safe refactoring |
| Mean Time to Recovery | &lt;60 minutes | Reduces customer impact of incidents |
| Failed Deployments | &lt;5% | Indicates pipeline maturity |
| Test Suite Duration | &lt;15 minutes | Fast feedback enables fast iteration |
| Flaky Test Rate | &lt;1% | Flakes erode trust in CI |
| Customer-Reported P0/P1 | &lt;2 per month | Direct measure of customer-perceived quality |

## 7.2 Quality Reporting
Weekly Quality Dashboard: posted in #engineering channel showing all KPIs
Monthly Quality Review: QA Lead presents trends, deep dives, action items to leadership
Post-Incident Reviews: blameless postmortem within 5 days of any P0/P1 incident
Quarterly Test Strategy Review: refine test pyramid, retire obsolete tests, identify gaps

# 8. Test Environments

| Environment | Purpose | Data | Refresh Cadence |
| --- | --- | --- | --- |
| Local Dev | Engineer&apos;s workstation | Seed scripts, synthetic | On-demand reset via npm run db:reset |
| CI | Run automated tests in PR | Ephemeral fixtures | Per-test, fresh containers |
| Staging | Pre-production validation | Anonymized prod snapshot | Weekly refresh, on-demand resets |
| Sandbox | Customer integration testing | Customer&apos;s test data | Persistent, customer-managed |
| Production | Live customer environment | Real customer data | Never reset |

## 8.1 Test Data Strategy
Synthetic data generators using Faker for unit and integration tests
Anonymized production snapshots refreshed weekly to staging (PII removed/scrambled)
Persistent &apos;demo&apos; organizations in staging for sales demos and product reviews
Dedicated test phone numbers in 3 markets for end-to-end WhatsApp testing
Dedicated Stripe test accounts for billing flows
Dedicated Meta test WABA for template approval flow testing

# 9. Mobile Testing
Mobile apps require additional testing dimensions: device fragmentation, network conditions, OS versions, and app store policies.
## 9.1 Device Coverage
Tier 1 (must work flawlessly):
iOS: iPhone 12, 13, 14, 15 (latest 3 iOS versions)
Android: Samsung Galaxy A series, Xiaomi Redmi, Realme (popular India devices)
Android OS: 11, 12, 13, 14
Tier 2 (smoke test only):
iOS: iPhone X and SE 2nd gen
Android: Older Samsung J series, budget Oppo/Vivo devices
Android OS: 10 (legacy support)
Cloud Device Lab:
BrowserStack App Live for manual testing across 30+ device combinations
BrowserStack App Automate for automated E2E runs across 10 priority devices
## 9.2 Network Condition Testing
Test on 2G (intermittent connection): app must show offline state and queue actions
Test on 3G (slow): app must remain responsive with skeletons and progressive loading
Test on 4G/5G/WiFi: full performance, all features active
Test offline-to-online transitions: queued messages must sync correctly
## 9.3 App Store Compliance
App Store / Play Store guidelines reviewed before each major release
Privacy nutrition labels updated when data collection changes
Beta testing via TestFlight (iOS) and Play Console internal track (Android)
Phased rollout on store: 1% → 10% → 50% → 100% over 7 days

End of Test Strategy &amp; QA Plan
WBMSG v1.0 | April 2026 | Strictly Confidential