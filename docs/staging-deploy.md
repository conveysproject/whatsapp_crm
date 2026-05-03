# Staging Deployment Guide

## Architecture

| Service     | Platform | Notes                        |
|-------------|----------|------------------------------|
| Web (Next)  | Vercel   | Root directory: `apps/web`   |
| API (Fastify) | Railway | Dockerfile in `apps/api/`   |
| PostgreSQL  | Railway  | Managed database             |
| Redis       | Railway  | Managed Redis                |
| Meilisearch | Railway  | Or Meilisearch Cloud         |

---

## 1. Railway Setup (API + Services)

1. Create a new Railway project
2. Add services: **PostgreSQL**, **Redis**, **Meilisearch** (from Railway templates)
3. Add a new service → **Deploy from GitHub repo** → select this repo
4. In service settings → **Source** → Root Directory: `/` (leave default)
5. Railway auto-detects `apps/api/railway.toml` and uses the Dockerfile

### Railway API Environment Variables

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
MEILISEARCH_HOST=http://${{Meilisearch.RAILWAY_PRIVATE_DOMAIN}}:7700
MEILISEARCH_MASTER_KEY=<generate-random-key>

CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

CORS_ORIGIN=https://<your-vercel-app>.vercel.app

NODE_ENV=production
LOG_LEVEL=info
API_PORT=4000
API_HOST=0.0.0.0

META_APP_ID=xxxx
META_APP_SECRET=xxxx
META_REDIRECT_URI=https://<your-vercel-app>.vercel.app/connect-waba/callback

WA_PHONE_NUMBER_ID=
WA_ACCESS_TOKEN=
WA_VERIFY_TOKEN=trustcrm_verify_2026
WA_WEBHOOK_SECRET=

IMPORT_TOKEN_SECRET=<generate-random-32-char-string>

ANTHROPIC_API_KEY=
OPENAI_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

---

## 2. Vercel Setup (Web)

1. Import repo on Vercel
2. **Framework**: Next.js (auto-detected)
3. **Root Directory**: `apps/web`
4. Build & output settings are in `apps/web/vercel.json`

### Vercel Environment Variables

```env
NEXT_PUBLIC_API_URL=https://<your-railway-api>.railway.app

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/checklist

NEXT_PUBLIC_META_APP_ID=xxx
NEXT_PUBLIC_META_CONFIG_ID=xxx
NEXT_PUBLIC_META_REDIRECT_URI=https://<your-vercel-app>.vercel.app/connect-waba/callback
```

---

## 3. After Deploy — Update External Services

### Clerk
- Dashboard → Webhooks → update endpoint to: `https://<railway-api>.railway.app/webhooks/clerk`

### Meta App
- App Settings → Basic → App Domains → add `<your-vercel-app>.vercel.app`
- Facebook Login → Settings → Valid OAuth Redirect URIs → add `https://<your-vercel-app>.vercel.app/connect-waba/callback`
- WhatsApp → Configuration → Callback URL → add `https://<railway-api>.railway.app/v1/webhooks/whatsapp`

---

## 4. First Deploy Checklist

- [ ] Railway PostgreSQL, Redis, Meilisearch services running
- [ ] Railway API deployed and healthy (`/health` returns 200)
- [ ] Prisma migrations ran on first boot (check Railway logs)
- [ ] Vercel web deployed and accessible
- [ ] Clerk webhook updated to Railway URL
- [ ] Meta redirect URIs updated to Vercel URL
- [ ] Sign up a test user end-to-end
