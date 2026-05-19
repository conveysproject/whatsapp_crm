# Rollback Strategy — TrustCRM Production

> **Date:** 2026-05-18 | **Platform:** Railway (API) + Vercel (Web)

---

## Rollback Tiers

| Tier | Trigger | Action | RTO |
|------|---------|--------|-----|
| T1 | Web deploy broke UI | Vercel instant rollback | < 2 min |
| T2 | API deploy broke endpoints | Railway redeploy previous build | < 5 min |
| T3 | DB migration corrupted data | Restore from Railway backup | < 30 min |
| T4 | Complete system failure | Full environment restore | < 2 hours |

---

## T1: Web Rollback (Vercel)

**Trigger conditions:**
- Next.js 500 errors on any page
- Critical UI component crashes (error boundary fires)
- Core user flow broken (sign-in, inbox, contacts)

**Procedure:**
```bash
# 1. Find last good deployment
vercel ls

# 2. Get deployment ID (format: dpl_xxxx)
# 3. Redeploy it
vercel redeploy <deployment-url>

# Example:
vercel redeploy https://trustcrm-web-abc123.vercel.app
```

**Verification:**
- [ ] `https://trustcrm-web-conveysproject-7758s-projects.vercel.app` loads without error
- [ ] Sign in flow works
- [ ] Inbox loads and shows conversations

**RTO: < 2 minutes**

---

## T2: API Rollback (Railway)

**Trigger conditions:**
- API health check failing: `GET https://trustcrmapi-production.up.railway.app/health` != 200
- Error rate > 5% in Datadog over 5-minute window
- Critical endpoint returning 500 (webhooks, auth, message send)

**Procedure:**
```bash
# 1. Link service (required once per session)
railway service link "@trustcrm/api"

# 2. View recent deploy log to identify last good build
railway service logs --build --lines 50

# 3. In Railway dashboard: go to Deployments tab → find last successful deploy → click "Redeploy"
# OR via CLI:
railway service status --all  # find last SUCCESS deploy hash

# 4. Force redeploy of specific commit (if bad commit identified)
git revert <bad-commit-hash>
git push origin main
# Railway auto-deploys on push to main
```

**Verification:**
```bash
# Check API is healthy
curl https://trustcrmapi-production.up.railway.app/health

# Check recent logs for errors
railway service logs --filter "@level:error" --lines 20

# Check HTTP error rate
railway service logs --http --status ">=500" --lines 20
```

**RTO: < 5 minutes**

---

## T3: Database Migration Rollback

**Trigger conditions:**
- Prisma migration caused data corruption
- API returns 500 due to schema mismatch
- Missing column / constraint violation errors in logs

**Pre-migration checklist (ALWAYS run before schema changes):**
- [ ] Backup created: Railway auto-backup runs daily; verify last backup timestamp in Railway dashboard
- [ ] Migration tested in staging (Railway staging environment)
- [ ] Migration is additive (adding columns) not destructive (removing/renaming)
- [ ] If destructive: coordinate with team, announce maintenance window

**Procedure for migration rollback:**

**Option A: Column add was wrong (safe to undo)**
```bash
# Connect to Railway DB
railway run npx prisma db execute --stdin <<'SQL'
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "newColumn";
SQL

# Mark migration as rolled back
railway run npx prisma migrate resolve --rolled-back <migration-name>
```

**Option B: Data corrupted — restore from backup**
```bash
# 1. Put API in maintenance mode (Railway env var)
railway variable set MAINTENANCE_MODE=true
railway redeploy

# 2. Download backup from Railway dashboard
# Railway dashboard → PostgreSQL service → Backups → Download

# 3. Restore to new DB instance
# Railway: create new PostgreSQL service, restore backup

# 4. Update DATABASE_URL to point to restored DB
railway variable set DATABASE_URL=<new-db-url>
railway variable set MAINTENANCE_MODE=false
railway redeploy

# 5. Verify data integrity
railway run npx prisma db pull  # schema should match
```

**RTO: < 30 minutes (data restore)**

---

## T4: Full Environment Restore

**Trigger conditions:**
- Railway service deleted accidentally
- Catastrophic Redis data loss
- Complete platform failure

**Procedure:**
```bash
# 1. Provision new Railway environment
railway init --name trustcrm-recovery

# 2. Deploy API
railway up --service api

# 3. Set all environment variables (from backed-up .env or Railway UI)
# Required vars (full list in docs/env-vars.md):
railway variable set DATABASE_URL=<postgres-url>
railway variable set REDIS_URL=<redis-url>
railway variable set CLERK_SECRET_KEY=<key>
railway variable set META_ACCESS_TOKEN=<token>
railway variable set META_PHONE_NUMBER_ID=<id>
railway variable set META_WEBHOOK_SECRET=<secret>
railway variable set STRIPE_SECRET_KEY=<key>
railway variable set STRIPE_WEBHOOK_SECRET=<secret>
railway variable set MEILISEARCH_HOST=<url>
railway variable set MEILISEARCH_API_KEY=<key>
railway variable set SENTRY_DSN=<dsn>

# 4. Restore DB from backup (see T3 procedure)

# 5. Re-populate Meilisearch index
railway run node scripts/reindex-meilisearch.js

# 6. Update Vercel NEXT_PUBLIC_API_URL to new Railway URL
vercel env add NEXT_PUBLIC_API_URL

# 7. Update Meta webhook URL in Facebook Developer Portal
```

**RTO: < 2 hours**

---

## Feature Flag Rollback

For new features shipped with feature flags (recommended for all Cycle 3+ features):

**Pattern:**
```typescript
// apps/api/src/lib/feature-flags.ts
export function isFeatureEnabled(feature: string, orgId: string): boolean {
  const enabledOrgs = process.env[`FF_${feature.toUpperCase()}`]?.split(',') ?? []
  return enabledOrgs.includes('*') || enabledOrgs.includes(orgId)
}
```

**Usage:**
```typescript
// In route handler
if (!isFeatureEnabled('RAZORPAY', request.orgId)) {
  return reply.code(404).send({ error: 'Not available' })
}
```

**Disable feature without redeploy:**
```bash
railway variable set FF_RAZORPAY=""
# Takes effect on next request — no redeploy needed
```

---

## Rollback Decision Tree

```
INCIDENT DETECTED
      │
      ▼
Is the API health check failing?
      │
   YES ──→ T2: API Rollback (5 min)
      │
      NO
      │
      ▼
Are there database errors in logs?
      │
   YES ──→ Was there a migration in the last deploy?
           │
        YES ──→ T3: DB Rollback (30 min)
           │
           NO ──→ Investigate — may be connection/config issue
      │
      NO
      │
      ▼
Is the web UI broken?
      │
   YES ──→ T1: Vercel Rollback (2 min)
      │
      NO
      │
      ▼
Specific feature broken? → Feature flag disable (instant)
```

---

## Communication Template

```
INCIDENT: TrustCRM [API/Web] degradation
SEVERITY: P[1/2/3]
DETECTED: [time]
IMPACT: [what users are experiencing]
STATUS: Rollback to [version/date] in progress
ETA: [time]
ENGINEER: [name]

Updates every 10 minutes in #incidents Slack channel.
```

---

## Post-Rollback Checklist

- [ ] Health check passing
- [ ] No error spike in Datadog
- [ ] Meta webhook receiving events
- [ ] Test message sends successfully
- [ ] Incident documented in postmortem doc
- [ ] Root cause identified
- [ ] Fix scheduled (not just rolled back)

---

*Owner: On-call Engineer | Escalation: CTO*
