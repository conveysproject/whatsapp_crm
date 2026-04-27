# TrustCRM
# Developer Onboarding Guide
## Welcome to the Team
Version 1.0 | April 2026
For Internal Use
## Welcome aboard! 🎉
We&apos;re thrilled to have you on the TrustCRM team. This guide will help you set up your environment, understand how we work, and ship your first feature. Most engineers ship their first commit on Day 1 and their first feature within Week 1. Let&apos;s make that happen for you too.

# Table of Contents

# 1. Day 1 Checklist
Your first day should focus on access, environment setup, and meeting your team. Don&apos;t worry about shipping anything substantial yet — we&apos;d rather you build a solid foundation.
## 1.1 Access &amp; Accounts
Confirm you have access to all of these. If anything is missing, ping #onboarding in Slack.
Google Workspace (email, drive, calendar)
Slack workspace and joined relevant channels
GitHub: trustcrm organization, added to your pod&apos;s team
Linear: workspace access, assigned to your pod&apos;s project
AWS console (read-only by default; write access requires manager approval)
1Password vault for shared credentials
Datadog for observability dashboards
Figma for design reviews
Notion for the engineering wiki
## 1.2 Hardware Setup
MacBook Pro (M-series): provisioned and shipped before Day 1
FileVault encryption enabled
Required apps installed via the company MDM
Optional: external monitor, keyboard, mouse (order via #it-support)
## 1.3 Meet Your Team
Your manager will set up these introductions during your first week:
1:1 with your direct manager (recurring weekly)
Pod kickoff with your tech lead
Coffee chats with each pod member (15 minutes each)
Welcome session with the CTO/VP Engineering
Product walkthrough with a Product Manager
Optional: meet someone from sales, customer success, or design

# 2. Environment Setup
Follow these steps to get the codebase running locally. Total time: about 30 minutes if everything goes smoothly. If you hit a wall, ping your buddy or the #engineering-help channel.
## 2.1 Prerequisites
Required tools:
Node.js 20 LTS (use nvm or fnm to manage versions)
npm 10+ (comes with Node 20)
pnpm 9+ for the monorepo
Docker Desktop (for local Postgres, Redis, Meilisearch)
Python 3.11 (for the ML service)
Git 2.40+
VS Code (recommended) or your preferred IDE
Recommended VS Code extensions:
ESLint and Prettier
Prisma extension for schema files
Tailwind CSS IntelliSense
GitLens
Error Lens
## 2.2 Clone and Install
git clone git@github.com:trustcrm/trustcrm.git
cd trustcrm
pnpm install
This installs dependencies for all apps and packages in the monorepo.
## 2.3 Environment Variables
Copy the example env files and ask your tech lead for development credentials:
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/ml-service/.env.example apps/ml-service/.env
Fill in the values from the shared 1Password vault entry titled &apos;Dev Environment Variables&apos;. Never commit a populated .env file to Git.
## 2.4 Start Local Services
docker compose up -d
This starts PostgreSQL, Redis, and Meilisearch in containers. They persist between sessions.
## 2.5 Set Up the Database
pnpm db:migrate
pnpm db:seed
This applies all Prisma migrations and seeds the database with sample data: 2 organizations, 5 users, 100 contacts, and a few sample conversations.
## 2.6 Run the Apps
pnpm dev
This starts the API on port 3001, the web app on port 3000, and the ML service on port 8000. Visit http://localhost:3000 and log in with the seeded test account: dev@trustcrm.test / password123.

# 3. Repository Structure
TrustCRM lives in a single monorepo managed by Turborepo and pnpm workspaces. This keeps all our code in one place while allowing independent deployment of each application.
## 3.1 Top-Level Layout

| Path | Purpose |
| --- | --- |
| apps/api | Fastify REST API and webhook handlers |
| apps/web | Next.js web application (customer-facing) |
| apps/mobile | React Native mobile app (iOS + Android) |
| apps/ml-service | Python FastAPI service for predictions and embeddings |
| apps/workers | BullMQ background job workers |
| packages/shared | TypeScript types, Zod schemas, shared utilities |
| packages/db | Prisma schema, migrations, and database client |
| packages/ui | Design system: shared React components and Tailwind config |
| infra/ | Terraform IaC for AWS resources |
| docs/ | Architecture decision records and runbooks |

# 4. Coding Standards
Consistent code is easier to read, review, and maintain. We rely heavily on automation (ESLint, Prettier, TypeScript) to enforce these standards so engineers can focus on logic rather than style debates.
## 4.1 General Principles
Optimize for the next reader, not for cleverness
Make the right thing the easy thing — push complexity into shared utilities
Code should fail loudly: throw early, throw clearly
Don&apos;t write code you don&apos;t have a test for
Delete code aggressively; bytes are free, complexity is expensive
Prefer composition over inheritance, pure functions over classes
Avoid premature abstraction; the rule of three is a good guide
## 4.2 TypeScript Conventions
Use strict mode, no any types unless explicitly justified in a comment
Prefer interfaces for object shapes that may be extended; types for unions and aliases
Use Zod schemas as the single source of truth for runtime validation and TypeScript types
Name files in kebab-case: user-service.ts, not UserService.ts
Name components in PascalCase: ContactCard.tsx, MessageThread.tsx
Name functions in camelCase: createContact, sendMessage
Use enums sparingly; prefer string literal unions
## 4.3 React &amp; Next.js
Use React Server Components by default; client components only when interactivity is needed
Co-locate component, styles, and tests in the same folder
One component per file, named export with the same name as the file
Custom hooks for shared stateful logic, prefixed with use
Tailwind classes for styling; never write CSS unless absolutely necessary
Use cn() utility (clsx + tailwind-merge) for conditional classes
## 4.4 API Conventions
Routes follow REST conventions: /v1/contacts, /v1/contacts/:id
Use plural nouns for collections, never verbs in paths
Validate every request with Zod before touching business logic
Wrap all DB operations in transactions when they span multiple tables
Never query the database in a loop — batch or join instead
Always include organization_id in queries (RLS will catch you, but be explicit)
## 4.5 SQL &amp; Database
Use Prisma migrations for all schema changes; never edit the DB directly
Migrations must be reversible; always provide a down migration
Add indexes for any column used in WHERE, JOIN, or ORDER BY at scale
Use UUIDs for primary keys (gen_random_uuid())
Use TIMESTAMPTZ for all timestamps; store in UTC, convert at the edge
Use JSONB for flexible/sparse data; structured columns for queryable data

# 5. Git Workflow
## 5.1 Branching
main is the source of truth — always deployable, always green
Feature branches: feat/short-description (e.g. feat/contact-search)
Bug fix branches: fix/short-description
Refactor branches: refactor/short-description
Branch from latest main, rebase on main before opening PR
Delete branches after merge (GitHub does this automatically)
## 5.2 Commits
We use Conventional Commits to keep history clean and enable automated changelog generation:
feat(inbox): add typing indicator to message thread
fix(api): correct timezone handling in deal close dates
refactor(db): extract contact search into reusable function
docs(api): update OpenAPI spec for templates endpoint
chore(deps): bump fastify from 4.21 to 4.22
test(campaigns): add e2e test for scheduled campaign
Common types: feat, fix, refactor, docs, chore, test, perf, style.
## 5.3 Pull Requests
Opening a PR:
Keep PRs small — under 400 lines of diff is the sweet spot
If your change is larger, split it into a stack of dependent PRs
Use the PR template (auto-loaded by GitHub)
Link the Linear ticket in the PR description
Add screenshots or screen recordings for any UI change
Mark as draft if not ready for review
Reviewing a PR:
Aim to review PRs within 4 working hours of being requested
Approve only if you&apos;d be comfortable shipping it yourself
Distinguish between blocking comments (must fix) and suggestions (nice to have)
Be kind. Code review is a conversation, not a courtroom
Use &apos;nit:&apos; prefix for purely stylistic suggestions
Merging a PR:
Squash and merge is the default
Use a clear, conventional commit-style merge message
Author merges their own PR after approval
Branch is auto-deleted after merge

# 6. Testing Expectations
Every change should be accompanied by tests. The detailed test strategy lives in a separate document; this section covers what&apos;s expected of every engineer day-to-day.
## 6.1 What to Test
Every new function: at least one happy-path unit test
Every new API endpoint: integration test for success and primary error cases
Every new component: render test, plus interaction tests for key behaviors
Every bug fix: regression test that would have caught the bug
Every critical user journey: an E2E test (added by QA + you, in collaboration)
## 6.2 Running Tests Locally
pnpm test                  # Run all tests
pnpm test --filter=api     # Run API tests only
pnpm test:watch            # Watch mode for fast iteration
pnpm test:coverage         # Generate coverage report
pnpm test:e2e              # Run Playwright E2E tests
## 6.3 Coverage Targets
New code: ≥80% line coverage on changed files (enforced in CI)
Critical paths (auth, billing, message sending): 100% coverage
UI components: render + key interactions covered
Don&apos;t game the metric — test behavior, not just lines

# 7. Ways of Working
## 7.1 Async First
We work across time zones, so async communication is the default. Synchronous meetings are reserved for things that genuinely need real-time discussion.
Default to writing things down (Slack, Notion, Linear, code comments)
Don&apos;t expect immediate responses; assume people are heads-down
If something is urgent, say so explicitly and use the right channel
Long-form decisions go in Notion or as ADRs in the docs/ folder
## 7.2 Slack Etiquette
Use threads to keep channels readable
Use channel mentions (@channel, @here) sparingly — only when truly broadcast-worthy
Set status when in deep work, OOO, or in a meeting
Use the right channel: #engineering for tech discussions, #random for chitchat
Pinned messages in channels contain the channel&apos;s purpose and norms
## 7.3 Meetings
Every meeting has a clear agenda shared in advance
Every meeting has a designated note-taker (rotates within pod)
Notes go in Notion within 24 hours, action items in Linear
If you don&apos;t need to be in a meeting, decline politely
Default duration is 25 or 50 minutes (5 minutes for buffer)
## 7.4 Focus Time
Most engineers block 4 hours per day for deep work — protect this
Tuesday and Thursday afternoons are no-meeting blocks (org-wide norm)
If your calendar is back-to-back, raise it with your manager

# 8. On-Call &amp; Incidents
Once you&apos;ve been ramping for about 3 months, you&apos;ll join the on-call rotation. We take on-call seriously: it&apos;s how we keep our promise of reliability to customers.
## 8.1 On-Call Rotation
Primary and secondary on-call, rotating weekly (Mon-Sun)
Rotation includes engineers from Platform pod plus volunteers from other pods
On-call engineers must be reachable within 15 minutes during their shift
Compensation: extra time off equal to time spent responding to incidents
## 8.2 Incident Response
When an alert fires:
Acknowledge the alert in PagerDuty within 5 minutes
Open #incidents Slack channel and post initial assessment
Determine severity (P0/P1/P2) and update status page if customer-facing
Mitigate first (rollback, kill switch), investigate root cause after
Resolve and update stakeholders
Schedule blameless postmortem within 5 days for any P0 or P1
## 8.3 Runbooks
Every alert has a linked runbook in docs/runbooks/
Runbooks cover: what the alert means, how to triage, common fixes, escalation path
If you fix something during on-call, update or create a runbook for next time

# 9. Your First 30 Days
Here&apos;s a recommended pace for ramping up. Adjust based on your prior experience and your manager&apos;s guidance.
## 9.1 Week 1 — Setup &amp; Orientation
Complete the Day 1 checklist (access, accounts, hardware)
Get local environment running, including the test database and seeded data
Read the PRD and the architecture overview document
Shadow your buddy on a few PR reviews to learn our standards
Ship your first PR: pick a small bug or &apos;good first issue&apos; from Linear
Attend your first sprint planning and retrospective
## 9.2 Week 2 — First Real Feature
Pick up a small story from your pod&apos;s backlog (with help from tech lead)
Pair-program with a teammate for at least 4 hours
Write tests as you go; don&apos;t bolt them on at the end
Do your first PR review for someone else&apos;s code
Ask &apos;why do we do it this way&apos; for at least 3 things — your fresh perspective is valuable
## 9.3 Weeks 3-4 — Building Confidence
Take ownership of an end-to-end feature (small in scope, full in responsibility)
Deploy to production at least once (ideally several times)
Demo your work in sprint review
Identify one improvement to the codebase, docs, or process — and make it
Have a 30-day check-in with your manager
## 9.4 Beyond 30 Days
Take ownership of a feature area or technical domain
Mentor the next new hire as their buddy
Contribute to architecture decisions in your pod
Join the on-call rotation (around month 3)
Set quarterly growth goals with your manager

# 10. Helpful Resources
## 10.1 Internal Resources

| Resource | What you&apos;ll find |
| --- | --- |
| Engineering Wiki (Notion) | Architecture, runbooks, ADRs, postmortems, team norms |
| Linear | Sprint backlog, roadmap, bugs, feature specs |
| Storybook | Component library and design system documentation |
| Datadog | Production observability — logs, metrics, traces, dashboards |
| API Docs (Stoplight) | Internal and partner API documentation, generated from OpenAPI |
| Figma | Design files, prototypes, design system source |

## 10.2 External References
Meta WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
Anthropic Claude API: https://docs.anthropic.com
Prisma documentation: https://www.prisma.io/docs
Fastify documentation: https://fastify.dev
Next.js App Router: https://nextjs.org/docs/app
React Native + Expo: https://docs.expo.dev
## 10.3 Slack Channels to Join
#engineering — main engineering announcements
#engineering-help — get help, ask questions, no question is too dumb
#engineering-updates — sprint recaps, demo links
#incidents — production issues and on-call coordination
#deploys — automated deployment notifications
Your pod&apos;s channel: #pod-platform / #pod-messaging / #pod-crm / #pod-ai
#random — non-work chitchat, pet pictures encouraged

# 11. A Note from the Team
Building TrustCRM is a long journey, and we&apos;re glad you&apos;re walking it with us. A few things to keep in mind as you settle in:
Ask questions. Nobody expects you to know how everything works. The faster you ask, the faster you ramp. Your fresh eyes also catch things we&apos;ve stopped seeing.
Make small mistakes early. We have a strong safety net: tests, code review, staging, feature flags, easy rollbacks. Use it. We&apos;d rather you ship and learn than over-think and stall.
Improve as you go. If something is confusing, document it. If a process is broken, raise it. If a runbook is wrong, fix it. The engineering culture is shaped by every commit you make to it.
Remember why we&apos;re here. TrustCRM exists to give small businesses the same superpowers that big companies have. Every feature you ship makes someone&apos;s day a little easier. Don&apos;t lose sight of that.
## Welcome aboard. We&apos;re glad you&apos;re here. ❤️
End of Developer Onboarding Guide
TrustCRM v1.0 | April 2026 | For Internal Use