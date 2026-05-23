# WABA Connect Flow Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the WABA Embedded Signup OAuth flow so the code exchange succeeds and users can connect their WhatsApp Business Account.

**Architecture:** Replace the `FB.login()` popup approach (which uses `facebook.com/connect/login_success.html` as its internal redirect — a Facebook URL that can't be added to Valid OAuth Redirect URIs) with a standard full-page OAuth redirect. The redirect flow gives us deterministic, app-controlled `redirect_uri` on both sides. The existing `callback/page.tsx` already handles the landing page; we just need to wire it up correctly.

**Tech Stack:** Next.js 15 App Router (frontend), Fastify 4 + ESM (backend), Meta Graph API v25.0

---

## Why popup flow fails (root cause)

`FB.login()` popup internally sets `redirect_uri=https://www.facebook.com/connect/login_success.html` in the OAuth dialog. The server-side token exchange must send the same URI. But Meta's dashboard blocks adding any `facebook.com` URL to Valid OAuth Redirect URIs. Result: redirect_uri always mismatches → error 191 or 100.

**Fix:** Use a standard redirect flow where WE set `redirect_uri=https://wbmsg.com/connect-waba/callback` in the OAuth URL, the same URL is registered in Valid OAuth Redirect URIs, and the backend sends the same value. No guessing.

---

## Meta App Dashboard — Pre-requisites (do before any code changes)

These must be correct or nothing works:

| Setting | Location | Required Value |
|---------|----------|----------------|
| App Domains | App Settings → Basic | `wbmsg.com` (bare domain, no `https://`, no trailing slash) |
| Valid OAuth Redirect URIs | Facebook Login for Business → Settings | `https://wbmsg.com/connect-waba/callback` only |
| Allowed Domains for JS SDK | Facebook Login for Business → Settings | `wbmsg.com` (bare domain — remove any `https://wbmsg.com/` entry) |
| App Mode | Top bar | Live (not Development) OR Devendra Sharma has a tester role |

---

## Files Changed

| File | Action | What it does |
|------|--------|--------------|
| `apps/web/app/(onboarding)/connect-waba/page.tsx` | **Rewrite** | Replace FB.login() popup with redirect to Facebook OAuth URL |
| `apps/web/app/(onboarding)/connect-waba/callback/page.tsx` | **Modify** | Pass `redirect_uri` in the backend call body |
| `apps/api/src/routes/onboarding.ts` | **Modify** | Clean up redirect_uri logic — always send `META_REDIRECT_URI` |
| Railway env vars | **Verify** | `META_REDIRECT_URI=https://wbmsg.com/connect-waba/callback` |

---

## Task 1: Rewrite `connect-waba/page.tsx` — redirect instead of popup

**Files:**
- Modify: `apps/web/app/(onboarding)/connect-waba/page.tsx`

**What we're doing:** Remove FB SDK entirely. When user clicks "Connect with Meta", redirect the browser to the Facebook OAuth URL with our `redirect_uri`. Facebook runs the embedded signup flow, then redirects back to our callback page with `?code=...`.

- [ ] **Step 1: Replace the file content**

```tsx
"use client";

import { type JSX } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";
const CONFIG_ID = process.env["NEXT_PUBLIC_META_CONFIG_ID"] ?? "";
const REDIRECT_URI = process.env["NEXT_PUBLIC_META_REDIRECT_URI"] ?? "";

export default function ConnectWabaPage(): JSX.Element {
  const router = useRouter();

  function handleConnect(): void {
    if (!APP_ID || !CONFIG_ID || !REDIRECT_URI) return;
    const params = new URLSearchParams({
      client_id: APP_ID,
      config_id: CONFIG_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      override_default_response_type: "true",
    });
    window.location.href = `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}`;
  }

  if (!APP_ID || !CONFIG_ID || !REDIRECT_URI) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
        <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4 mb-6">
          <p className="text-sm text-yellow-800 font-medium">Meta configuration incomplete</p>
          <p className="text-xs text-yellow-700 mt-1">
            Set <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_APP_ID</code>,{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_CONFIG_ID</code>, and{" "}
            <code className="bg-yellow-100 px-1 rounded">NEXT_PUBLIC_META_REDIRECT_URI</code> in your
            environment variables.
          </p>
        </div>
        <Link
          href="/checklist"
          className="block w-full text-center border border-gray-300 text-gray-700 font-medium py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
        >
          Skip to checklist
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
      <p className="text-sm text-gray-500 mb-6">
        A guided setup will open — connect your WhatsApp Business Account and phone number in one
        flow.
      </p>
      <button
        onClick={handleConnect}
        className="block w-full text-center bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium py-2.5 rounded-lg transition-colors"
      >
        Connect with Meta
      </button>
      <p className="mt-4 text-center text-xs text-gray-400">
        Already connected?{" "}
        <Link href="/checklist" className="text-green-600 hover:underline">
          Skip to checklist
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(onboarding\)/connect-waba/page.tsx
git commit -m "fix(waba): replace FB.login popup with OAuth redirect — deterministic redirect_uri"
```

---

## Task 2: Update `callback/page.tsx` — pass `redirect_uri` to backend

**Files:**
- Modify: `apps/web/app/(onboarding)/connect-waba/callback/page.tsx`

**What we're doing:** The callback page already receives `?code=...` and calls the backend. It just needs to also send `redirect_uri` so the backend can include it in the Meta token exchange. Also pass `embedded: true` so the backend knows to run the post-steps (sync phone numbers, subscribe webhooks).

- [ ] **Step 1: Replace the file content**

```tsx
import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";

const API_URL = process.env["API_URL"] ?? process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
const REDIRECT_URI = process.env["NEXT_PUBLIC_META_REDIRECT_URI"] ?? "";

export default async function WabaCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; error?: string }>;
}): Promise<JSX.Element> {
  const { code, error: oauthError } = await searchParams;

  if (oauthError || !code) {
    return (
      <div className="text-center">
        <p className="text-red-600 font-medium mb-4">Connection failed. Please try again.</p>
        {oauthError && <p className="text-xs text-gray-500 mb-4 font-mono">{oauthError}</p>}
        <Link href="/connect-waba" className="text-green-600 hover:underline text-sm">Back</Link>
      </div>
    );
  }

  const { getToken } = await auth.protect();
  const token = await getToken();

  const res = await fetch(`${API_URL}/v1/onboarding/waba-callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token ?? ""}`,
    },
    body: JSON.stringify({ code, embedded: true, redirectUri: REDIRECT_URI }),
    cache: "no-store",
  });

  if (res.ok) {
    redirect("/provision-number");
  }

  const body = await res.json().catch(() => ({})) as {
    detail?: { error?: { message?: string } };
    error?: { message?: string } | string;
  };
  const detail =
    body?.detail?.error?.message ??
    (typeof body?.error === "string" ? body.error : body?.error?.message) ??
    `HTTP ${res.status}`;

  return (
    <div className="text-center">
      <p className="text-red-600 font-medium mb-4">Connection failed. Please try again.</p>
      <p className="text-xs text-gray-500 mb-4 font-mono">{detail}</p>
      <Link href="/connect-waba" className="text-green-600 hover:underline text-sm">Back</Link>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/\(onboarding\)/connect-waba/callback/page.tsx
git commit -m "fix(waba): pass redirect_uri from env to backend in callback page"
```

---

## Task 3: Clean up `onboarding.ts` backend — use body `redirectUri` with env fallback

**Files:**
- Modify: `apps/api/src/routes/onboarding.ts`

**What we're doing:** Accept `redirectUri` from the request body (the callback page sends it). Fall back to `META_REDIRECT_URI` env var. Always send it in the token exchange. Also accept `isSMB: true` from the callback page for the post-steps.

- [ ] **Step 1: Update the route body type and redirect_uri logic**

Replace lines 8–27 of `apps/api/src/routes/onboarding.ts`:

```ts
  fastify.post<{
    Body: {
      code?: string;
      embedded?: boolean;
      phoneNumberId?: string;
      wabaId?: string;
      isSMB?: boolean;
      redirectUri?: string;
    };
  }>("/waba-callback", async (request, reply) => {
    const { code, embedded, phoneNumberId, wabaId, isSMB, redirectUri } = request.body;
    if (!code) return reply.status(400).send({ error: "code required" });

    const { organizationId } = request.auth;

    const appId = process.env["META_APP_ID"] ?? "";
    const appSecret = process.env["META_APP_SECRET"] ?? "";

    // redirect_uri must match what the OAuth dialog used.
    // Callback page sends it explicitly; env var is the fallback.
    const resolvedRedirectUri = redirectUri ?? process.env["META_REDIRECT_URI"] ?? "";

    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    if (resolvedRedirectUri) params.set("redirect_uri", resolvedRedirectUri);
    const metaUrl = `${WA_GRAPH}/oauth/access_token?${params.toString()}`;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/routes/onboarding.ts
git commit -m "fix(waba): accept redirectUri from body, fall back to env for token exchange"
```

---

## Task 4: Set env vars — Vercel + Railway

**What we're doing:** The frontend needs `NEXT_PUBLIC_META_REDIRECT_URI` so it can build the OAuth URL. The backend already has `META_REDIRECT_URI`. Both must be the same value.

- [ ] **Step 1: Set Railway env var (already set, verify)**

```bash
railway service link "api"
railway variable set META_REDIRECT_URI="https://wbmsg.com/connect-waba/callback"
```

Expected output: confirms variable set.

- [ ] **Step 2: Set Vercel env vars for production**

```bash
vercel env add NEXT_PUBLIC_META_REDIRECT_URI production
# When prompted, enter: https://wbmsg.com/connect-waba/callback
```

- [ ] **Step 3: Verify both are set**

```bash
railway variable | grep META_REDIRECT
vercel env ls | grep META_REDIRECT
```

Expected: both show `https://wbmsg.com/connect-waba/callback`.

- [ ] **Step 4: Commit (nothing to commit — env only), push to trigger deploys**

```bash
git push origin main
```

---

## Task 5: Verify end-to-end

- [ ] **Step 1: Wait for Railway + Vercel to deploy (~4 min each)**

```bash
railway service logs --lines 5   # look for new hostname (new deployment)
```

- [ ] **Step 2: Test the flow on wbmsg.com/connect-waba**

1. Click "Connect with Meta"
2. Browser redirects to `facebook.com/v25.0/dialog/oauth?...`
3. Complete the business + WABA selection flow
4. Facebook redirects to `https://wbmsg.com/connect-waba/callback?code=...`
5. Page shows loading, then redirects to `/provision-number`

- [ ] **Step 3: Verify in Railway logs**

```bash
railway service logs --lines 30 | grep "waba-callback\|token exchange\|WABA ID\|post-steps"
```

Expected log lines:
```
Meta token exchange attempt  embedded=true
WABA ID resolved from Graph API  resolvedWabaId="152263..."   ← or from body if postMessage fires
Embedded sign-up post-steps ...  ← fire-and-forget ran
```

- [ ] **Step 4: Verify in DB**

```bash
railway run node -e "
const {PrismaClient} = await import('@prisma/client');
const p = new PrismaClient();
const orgs = await p.organization.findMany({select:{id:true,wabaAccessToken:true,whatsappBusinessAccountId:true,onboardingStep:true}});
console.log(JSON.stringify(orgs,null,2));
"
```

Expected: `wabaAccessToken` is populated, `whatsappBusinessAccountId` is populated, `onboardingStep` is `"provision_number"` or `"done"`.

---

## Summary of changes

| | Before | After |
|--|--------|-------|
| How OAuth starts | `FB.login()` popup (uncontrolled redirect_uri) | `window.location.href` to Facebook OAuth URL (we set redirect_uri) |
| redirect_uri in token exchange | Guessing (login_success.html / nothing / app URL) | Always `https://wbmsg.com/connect-waba/callback` — matches both sides |
| WABA ID capture | postMessage (not firing) | Graph API fallback always runs |
| FB SDK dependency | Yes (extra Script tag) | Removed |
