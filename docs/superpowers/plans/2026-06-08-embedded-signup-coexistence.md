# Embedded Signup + Coexistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace redirect-based WhatsApp onboarding with an inline FB JS SDK popup, add SMB coexistence mode, consolidate two overlapping backend endpoints into one, and surface reconnect in Settings.

**Architecture:** One shared `EmbeddedSignupButton` React component (FB JS SDK popup) handles all visual states inline (idle → connecting → success → error). A single canonical `POST /whatsapp-account/connect` endpoint writes to both `Organization` and `VendorSettings`, replacing `/embedded-signup` and `/onboarding/waba-callback`.

**Tech Stack:** Fastify 4 + Prisma (API), Next.js 15 App Router + React Query + Tailwind CSS (Web), Meta Graph API v25.0, Facebook JS SDK

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/api/src/routes/whatsapp-account.ts` | Add `/connect`, remove `/embedded-signup` |
| Modify | `apps/api/src/routes/whatsapp-account.test.ts` | Tests for `/connect` |
| Modify | `apps/api/src/routes/onboarding.ts` | Remove `/waba-callback` |
| Modify | `apps/api/src/routes/onboarding.test.ts` | Remove `/waba-callback` test |
| Create | `apps/web/components/whatsapp/EmbeddedSignupButton.tsx` | Shared popup button component |
| Modify | `apps/web/app/(onboarding)/connect-waba/page.tsx` | Use EmbeddedSignupButton |
| Delete | `apps/web/app/(onboarding)/connect-waba/callback/page.tsx` | No longer needed |
| Modify | `apps/web/app/(dashboard)/settings/whatsapp-account/page.tsx` | Add reconnect section |

---

### Task 1: Backend — `POST /whatsapp-account/connect` endpoint

**Files:**
- Modify: `apps/api/src/routes/whatsapp-account.ts`
- Modify: `apps/api/src/routes/whatsapp-account.test.ts`

**Overview:** Write tests first, then implement the consolidated `/connect` endpoint. It exchanges the OAuth code, resolves WABA + phone data via body fields or Graph API fallbacks, subscribes webhooks, and writes to both `Organization` and `VendorSettings` in a single atomic sequence.

- [ ] **Step 1: Extend mockPrisma with `organization` in the test file**

In `apps/api/src/routes/whatsapp-account.test.ts`, the existing `mockPrisma` (around line 16) only has `vendorSetting`. Add `organization: { update: vi.fn() }`:

```typescript
const mockPrisma = {
  vendorSetting: { upsert: vi.fn(), findFirst: vi.fn() },
  organization: { update: vi.fn() },
};
```

- [ ] **Step 2: Write failing tests for `POST /v1/whatsapp-account/connect`**

Add this entire `describe` block at the end of `apps/api/src/routes/whatsapp-account.test.ts` (after the last closing brace):

```typescript
describe("POST /v1/whatsapp-account/connect", () => {
  let app: FastifyInstance;

  function setupFetch(opts: {
    tokenOk?: boolean;
    wabaIdFromDebugToken?: string;
    phones?: { id: string; display_phone_number: string }[];
  } = {}): void {
    const {
      tokenOk = true,
      wabaIdFromDebugToken = "waba-1",
      phones = [{ id: "pn-1", display_phone_number: "+919000000001" }],
    } = opts;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: RequestInfo | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("oauth/access_token")) {
        if (!tokenOk)
          return new Response(JSON.stringify({ error: { message: "Invalid code" } }), { status: 400 });
        return new Response(JSON.stringify({ access_token: "tok-123" }), { status: 200 });
      }
      if (urlStr.includes("debug_token")) {
        const scopes = wabaIdFromDebugToken
          ? [{ scope: "whatsapp_business_messaging", target_ids: [wabaIdFromDebugToken] }]
          : [];
        return new Response(JSON.stringify({ data: { granular_scopes: scopes } }), { status: 200 });
      }
      if (urlStr.includes("phone_numbers")) {
        return new Response(JSON.stringify({ data: phones }), { status: 200 });
      }
      if (urlStr.includes("subscribed_apps") || urlStr.includes("smb_app_data")) {
        return new Response(JSON.stringify({ success: true }), { status: 200 });
      }
      // WABA name lookup or phone display lookup
      return new Response(JSON.stringify({ id: "waba-1", name: "My WABA", display_phone_number: "+919000000001" }), { status: 200 });
    });
  }

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env["META_APP_ID"] = "test-app-id";
    process.env["META_APP_SECRET"] = "test-app-secret";
    app = await buildApp();
  });
  afterEach(async () => { await app.close(); });

  it("returns 400 when code is missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("MISSING_CODE");
  });

  it("returns 400 when token exchange fails", async () => {
    setupFetch({ tokenOk: false });
    const res = await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "bad-code", wabaId: "waba-1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("TOKEN_EXCHANGE_FAILED");
  });

  it("returns 400 NO_WABA when wabaId absent and debug_token returns none", async () => {
    setupFetch({ wabaIdFromDebugToken: "" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe("NO_WABA");
  });

  it("happy path: saves to Organization and VendorSettings", async () => {
    setupFetch({});
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    const res = await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: { wabaId: string } }>().data.wabaId).toBe("waba-1");
    expect(mockPrisma.organization.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.vendorSetting.upsert).toHaveBeenCalled();
  });

  it("isSMB=true triggers smb_app_data call", async () => {
    setupFetch({});
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1", isSMB: true },
    });
    const fetchSpy = vi.mocked(globalThis.fetch);
    const smbCall = fetchSpy.mock.calls.find(([url]) => url.toString().includes("smb_app_data"));
    expect(smbCall).toBeDefined();
  });

  it("flow=onboarding with phoneNumberId sets onboardingStep=done", async () => {
    setupFetch({});
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1", phoneNumberId: "pn-1", flow: "onboarding" },
    });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onboardingStep: "done" }) })
    );
  });

  it("flow=onboarding without phoneNumberId sets onboardingStep=provision_number", async () => {
    setupFetch({ phones: [] });
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1", flow: "onboarding" },
    });
    expect(mockPrisma.organization.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ onboardingStep: "provision_number" }) })
    );
  });

  it("flow=reconnect does not update onboardingStep", async () => {
    setupFetch({});
    mockPrisma.organization.update.mockResolvedValue({});
    mockPrisma.vendorSetting.upsert.mockResolvedValue({});
    await app.inject({
      method: "POST",
      url: "/v1/whatsapp-account/connect",
      payload: { code: "abc", wabaId: "waba-1", flow: "reconnect" },
    });
    const updateCall = mockPrisma.organization.update.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(updateCall?.data).not.toHaveProperty("onboardingStep");
  });
});
```

- [ ] **Step 3: Run the connect tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose apps/api/src/routes/whatsapp-account.test.ts
```
Expected: All 8 new `POST /v1/whatsapp-account/connect` tests fail with 404 (route doesn't exist yet). Existing 3 tests still pass.

- [ ] **Step 4: Add `POST /whatsapp-account/connect` to `whatsapp-account.ts`**

Insert this route inside `whatsappAccountRouter`, directly before the `fastify.post("/whatsapp-account/disconnect-account"` line (currently near line 297):

```typescript
  fastify.post<{
    Body: {
      code: string;
      wabaId?: string;
      phoneNumberId?: string;
      isSMB?: boolean;
      flow?: "onboarding" | "reconnect";
    };
  }>("/whatsapp-account/connect", async (request, reply) => {
    const { organizationId } = request.auth;
    const { code, wabaId: bodyWabaId, phoneNumberId: bodyPhoneNumberId, isSMB = false, flow = "reconnect" } = request.body;

    if (!code) {
      return reply.status(400).send({ error: { code: "MISSING_CODE", message: "code is required" } });
    }

    const appId = process.env["META_APP_ID"] ?? "";
    const appSecret = process.env["META_APP_SECRET"] ?? "";
    if (!appId || !appSecret) {
      return reply.status(500).send({ error: { code: "APP_NOT_CONFIGURED", message: "Facebook app credentials not configured" } });
    }

    // Step 1: exchange code for access token
    const tokenRes = await fetch(
      `${WA_GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&code=${encodeURIComponent(code)}`,
      { method: "GET" }
    );
    if (!tokenRes.ok) {
      const err = await tokenRes.json() as { error?: { message?: string } };
      return reply.status(400).send({ error: { code: "TOKEN_EXCHANGE_FAILED", message: err.error?.message ?? "Failed to exchange code for token" } });
    }
    const { access_token: accessToken } = await tokenRes.json() as { access_token: string };

    // Step 2: resolve WABA ID (from body or debug_token fallback)
    let wabaId = bodyWabaId ?? "";
    if (!wabaId) {
      try {
        const appToken = `${appId}|${appSecret}`;
        const r = await fetch(
          `${WA_GRAPH}/debug_token?input_token=${accessToken}&access_token=${encodeURIComponent(appToken)}`
        );
        if (r.ok) {
          const d = await r.json() as { data?: { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> } };
          const scope = d.data?.granular_scopes?.find((s) => s.scope === "whatsapp_business_messaging");
          wabaId = scope?.target_ids?.[0] ?? "";
        }
      } catch {
        // non-fatal — wabaId stays ""
      }
    }
    if (!wabaId) {
      return reply.status(400).send({ error: { code: "NO_WABA", message: "No WhatsApp Business Account found" } });
    }

    // Step 3: fetch WABA name
    let wabaName = "";
    try {
      const r = await fetch(`${WA_GRAPH}/${wabaId}?fields=name&access_token=${accessToken}`);
      if (r.ok) {
        const d = await r.json() as { name?: string };
        wabaName = d.name ?? "";
      }
    } catch {
      // non-fatal
    }

    // Step 4: resolve phone number
    let phoneNumberId = bodyPhoneNumberId ?? "";
    let displayPhoneNumber: string | null = null;
    if (phoneNumberId) {
      try {
        const r = await fetch(`${WA_GRAPH}/${phoneNumberId}?fields=display_phone_number&access_token=${accessToken}`);
        if (r.ok) {
          const d = await r.json() as { display_phone_number?: string };
          displayPhoneNumber = d.display_phone_number ?? null;
        }
      } catch {
        // non-fatal
      }
    } else {
      try {
        const r = await fetch(`${WA_GRAPH}/${wabaId}/phone_numbers?fields=id,display_phone_number&access_token=${accessToken}`);
        if (r.ok) {
          const d = await r.json() as { data?: { id: string; display_phone_number: string }[] };
          const phone = d.data?.[0];
          if (phone) {
            phoneNumberId = phone.id;
            displayPhoneNumber = phone.display_phone_number;
          }
        }
      } catch {
        // non-fatal
      }
    }

    // Step 5: subscribe webhooks (fire-and-forget)
    const callbackUrl = `${(process.env["API_PUBLIC_URL"] ?? "").replace(/\/$/, "")}/v1/webhooks/whatsapp`;
    const verifyToken = createHash("sha1").update(organizationId).digest("hex");
    await fetch(`${WA_GRAPH}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ override_callback_uri: callbackUrl, verify_token: verifyToken, subscribed_fields: WA_SUBSCRIBED_FIELDS }),
    }).catch(() => undefined);

    // Step 6: coexistence mode (fire-and-forget)
    if (isSMB) {
      await fetch(`${WA_GRAPH}/${wabaId}/smb_app_data`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sync_type: "full" }),
      }).catch(() => undefined);
    }

    // Step 7: persist to Organization
    await fastify.prisma.organization.update({
      where: { id: organizationId },
      data: {
        wabaAccessToken: accessToken,
        whatsappBusinessAccountId: wabaId,
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(flow === "onboarding"
          ? { onboardingStep: phoneNumberId ? "done" : "provision_number" }
          : {}),
      },
    });

    // Step 8: persist to VendorSettings
    const settingsToSave = [
      { key: "whatsapp_access_token", value: accessToken },
      { key: "whatsapp_business_account_id", value: wabaId },
      { key: "webhook_verified_at", value: new Date().toISOString() },
      { key: "facebook_app_id", value: appId },
      { key: "whatsapp_access_token_expired", value: "0" },
      ...(phoneNumberId ? [{ key: "current_phone_number_id", value: phoneNumberId }] : []),
      ...(displayPhoneNumber ? [{ key: "current_phone_number_number", value: displayPhoneNumber }] : []),
    ];
    await Promise.all(
      settingsToSave.map((s) =>
        fastify.prisma.vendorSetting.upsert({
          where: { organizationId_key: { organizationId, key: s.key } },
          create: { organizationId, key: s.key, value: s.value, dataType: "string" },
          update: { value: s.value },
        })
      )
    );

    return reply.send({
      data: {
        wabaId,
        wabaName,
        phoneNumberId: phoneNumberId || null,
        displayPhoneNumber,
      },
    });
  });
```

- [ ] **Step 5: Run connect tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose apps/api/src/routes/whatsapp-account.test.ts
```
Expected: All 11 tests pass (8 new + 3 existing).

- [ ] **Step 6: Remove `POST /whatsapp-account/embedded-signup` from `whatsapp-account.ts`**

Delete the entire block starting at the comment `// GAP-S35: Embedded WABA sign-up — 5-step OAuth flow` (currently around line 191) through the closing `);` of that route (currently around line 295). The `disconnect-account` route should immediately follow.

- [ ] **Step 7: Run all whatsapp-account tests again**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose apps/api/src/routes/whatsapp-account.test.ts
```
Expected: All 11 tests still pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/whatsapp-account.ts apps/api/src/routes/whatsapp-account.test.ts
git commit -m "feat(api): add POST /whatsapp-account/connect, remove /embedded-signup"
```

---

### Task 2: Backend — Remove `POST /onboarding/waba-callback`

**Files:**
- Modify: `apps/api/src/routes/onboarding.ts`
- Modify: `apps/api/src/routes/onboarding.test.ts`

**Overview:** The waba-callback endpoint is fully replaced by `/whatsapp-account/connect`. Remove it from the router and remove its test. Keep `GET /status` and `POST /sync-phone` unchanged.

- [ ] **Step 1: Remove `POST /waba-callback` from `onboarding.ts`**

Delete the entire `fastify.post<{ Body: { ... } }>("/waba-callback", ...)` handler — from line 7 (`fastify.post<{`) through line 125 (the closing `});` of that handler). After deletion the file should start with the `fastify.get("/status"` handler.

Keep the `import { syncPhoneNumbers } from "../lib/whatsapp.js"` line — it is still used by `POST /sync-phone`.

After deletion `onboarding.ts` should look like:

```typescript
import type { FastifyPluginAsync } from "fastify";
import { syncPhoneNumbers } from "../lib/whatsapp.js";

const WA_GRAPH = "https://graph.facebook.com/v25.0";

export const onboardingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/status", async (request, reply) => {
    // ... unchanged
  });

  fastify.post("/sync-phone", async (request, reply) => {
    // ... unchanged
  });
};
```

- [ ] **Step 2: Remove the `/waba-callback` test block from `onboarding.test.ts`**

Delete the entire `describe("POST /v1/onboarding/waba-callback", ...)` block (lines 19–28 in the current file). Leave the `describe("GET /v1/onboarding/status", ...)` block intact.

- [ ] **Step 3: Check for stray references to waba-callback**

```bash
grep -r "waba-callback" apps/
```
Expected: No results (all references removed).

- [ ] **Step 4: Run onboarding tests**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose apps/api/src/routes/onboarding.test.ts
```
Expected: Only the `GET /v1/onboarding/status` test runs and passes.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/onboarding.ts apps/api/src/routes/onboarding.test.ts
git commit -m "feat(api): remove POST /onboarding/waba-callback (replaced by /whatsapp-account/connect)"
```

---

### Task 3: Frontend — `EmbeddedSignupButton` component

**Files:**
- Create: `apps/web/components/whatsapp/EmbeddedSignupButton.tsx`

**Overview:** Shared "Connect with Meta" button with four inline visual states. No page reloads at any state transition. The FB JS SDK script is injected once on mount. The postMessage listener captures WABA + phone IDs emitted by the SDK before the `FB.login` callback fires. The API call goes directly to the Fastify API (not through Next.js API routes) using a Clerk Bearer token.

- [ ] **Step 1: Create the component file**

Create `apps/web/components/whatsapp/EmbeddedSignupButton.tsx`:

```typescript
"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";

declare global {
  interface Window {
    fbAsyncInit?: () => void;
    FB?: {
      init: (options: { appId: string; version: string }) => void;
      login: (callback: (response: FBAuthResponse) => void, options: FBLoginOptions) => void;
    };
  }
}

interface FBAuthResponse {
  authResponse?: { code?: string };
  status?: string;
}

interface FBLoginOptions {
  config_id: string;
  response_type: string;
  override_default_response_type: boolean;
}

export interface ConnectResult {
  wabaId: string;
  wabaName: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
}

export interface EmbeddedSignupButtonProps {
  flow: "onboarding" | "reconnect";
  onSuccess: (result: ConnectResult) => void;
  onError: (message: string) => void;
}

type SignupState = "idle" | "connecting" | "success" | "error";

const APP_ID = process.env["NEXT_PUBLIC_META_APP_ID"] ?? "";
const CONFIG_ID = process.env["NEXT_PUBLIC_META_CONFIG_ID"] ?? "";
const SMB_CONFIG_ID = process.env["NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID"] ?? "";
const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export function EmbeddedSignupButton({ flow, onSuccess, onError }: EmbeddedSignupButtonProps): JSX.Element {
  const router = useRouter();
  const { getToken } = useAuth();
  const [state, setState] = useState<SignupState>("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSMB, setIsSMB] = useState(false);
  const [fbReady, setFbReady] = useState(false);
  const [result, setResult] = useState<ConnectResult | null>(null);

  const wabaIdRef = useRef("");
  const phoneNumberIdRef = useRef("");

  useEffect(() => {
    if (document.getElementById("facebook-jssdk")) {
      if (window.FB) setFbReady(true);
      return;
    }
    window.fbAsyncInit = () => {
      window.FB?.init({ appId: APP_ID, version: "v25.0" });
      setFbReady(true);
    };
    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  async function handleConnect(): Promise<void> {
    if (!window.FB) return;
    setState("connecting");
    wabaIdRef.current = "";
    phoneNumberIdRef.current = "";

    function onPostMessage(event: MessageEvent): void {
      if (event.origin !== "https://www.facebook.com") return;
      try {
        const data = (typeof event.data === "string" ? JSON.parse(event.data) : event.data) as {
          type?: string;
          event?: string;
          data?: { waba_id?: string; phone_number_id?: string };
        };
        if (data.type === "WA_EMBEDDED_SIGNUP" && data.event === "FINISH") {
          wabaIdRef.current = data.data?.waba_id ?? "";
          phoneNumberIdRef.current = data.data?.phone_number_id ?? "";
        }
      } catch {
        // ignore malformed messages
      }
    }
    window.addEventListener("message", onPostMessage);

    const configId = isSMB && SMB_CONFIG_ID ? SMB_CONFIG_ID : CONFIG_ID;

    window.FB.login(async (response: FBAuthResponse) => {
      window.removeEventListener("message", onPostMessage);
      const code = response.authResponse?.code;
      if (!code) {
        setState("idle");
        return;
      }

      try {
        const token = await getToken();
        const res = await fetch(`${API_URL}/v1/whatsapp-account/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
          body: JSON.stringify({
            code,
            wabaId: wabaIdRef.current || undefined,
            phoneNumberId: phoneNumberIdRef.current || undefined,
            isSMB,
            flow,
          }),
        });

        const body = await res.json() as { data?: ConnectResult; error?: { message?: string } };
        if (!res.ok) {
          const msg = body.error?.message ?? `Error ${res.status}`;
          setErrorMessage(msg);
          setState("error");
          onError(msg);
          return;
        }

        const connectResult = body.data!;
        setResult(connectResult);
        setState("success");
        onSuccess(connectResult);

        if (flow === "onboarding") {
          setTimeout(() => {
            router.replace(connectResult.phoneNumberId ? "/checklist" : "/provision-number");
          }, 1500);
        }
      } catch {
        const msg = "Network error. Please try again.";
        setErrorMessage(msg);
        setState("error");
        onError(msg);
      }
    }, { config_id: configId, response_type: "code", override_default_response_type: true });
  }

  if (state === "success" && result) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <div className="flex items-center gap-2 text-green-600">
          <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">{result.wabaName || "Connected"}</span>
        </div>
        {result.displayPhoneNumber && (
          <p className="text-sm text-gray-500">{result.displayPhoneNumber}</p>
        )}
        {flow === "onboarding" ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
            <span>Redirecting…</span>
          </div>
        ) : (
          <p className="text-sm text-green-600 font-medium">Connected!</p>
        )}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-700 mb-3">{errorMessage}</p>
        <button
          type="button"
          onClick={() => setState("idle")}
          className="text-sm text-red-600 underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  if (state === "connecting") {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-6 h-6 border-4 border-[#1877F2] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
        <p className="text-sm text-gray-600">Connecting your WhatsApp account…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {SMB_CONFIG_ID && (
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isSMB}
            onChange={(e) => setIsSMB(e.target.checked)}
            className="rounded border-gray-300"
          />
          I already use the WhatsApp Business App
        </label>
      )}
      <button
        type="button"
        onClick={() => void handleConnect()}
        disabled={!fbReady}
        className="flex items-center justify-center gap-2 w-full bg-[#1877F2] hover:bg-[#166fe5] text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
      >
        <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
        Connect with Meta
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```
Expected: No errors in `EmbeddedSignupButton.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/whatsapp/EmbeddedSignupButton.tsx
git commit -m "feat(web): add EmbeddedSignupButton (FB SDK popup, inline idle/connecting/success/error states)"
```

---

### Task 4: Frontend — Update `connect-waba/page.tsx`

**Files:**
- Modify: `apps/web/app/(onboarding)/connect-waba/page.tsx`

**Overview:** Replace the redirect-based OAuth handler with `EmbeddedSignupButton`. The component handles its own redirect after 1500ms — `onSuccess` is a no-op at the onboarding level. Remove all references to `NEXT_PUBLIC_META_REDIRECT_URI`.

- [ ] **Step 1: Replace the entire file content**

Overwrite `apps/web/app/(onboarding)/connect-waba/page.tsx` with:

```typescript
"use client";

import { type JSX } from "react";
import Link from "next/link";
import { EmbeddedSignupButton } from "@/components/whatsapp/EmbeddedSignupButton";

export default function ConnectWabaPage(): JSX.Element {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Connect WhatsApp Business</h2>
      <p className="text-sm text-gray-500 mb-6">
        A guided setup will open — connect your WhatsApp Business Account and phone number in one
        flow.
      </p>
      <EmbeddedSignupButton
        flow="onboarding"
        onSuccess={() => undefined}
        onError={() => undefined}
      />
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

- [ ] **Step 2: Type-check**

```bash
pnpm type-check
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/(onboarding)/connect-waba/page.tsx
git commit -m "feat(web): replace redirect OAuth with EmbeddedSignupButton on connect-waba page"
```

---

### Task 5: Frontend — Delete callback page and add reconnect to Settings

**Files:**
- Delete: `apps/web/app/(onboarding)/connect-waba/callback/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/whatsapp-account/page.tsx`

**Overview:** The OAuth callback page is dead code now that we use popup flow. The settings WhatsApp Account page gets a "Connect / Reconnect" section at the top using `EmbeddedSignupButton` in reconnect mode — on success it invalidates the health and profile queries without redirecting or reloading.

- [ ] **Step 1: Delete the callback page**

```bash
rm "apps/web/app/(onboarding)/connect-waba/callback/page.tsx"
```

- [ ] **Step 2: Verify no remaining references to the callback route**

```bash
grep -r "connect-waba/callback\|waba-callback" apps/web/
```
Expected: No results.

- [ ] **Step 3: Add `EmbeddedSignupButton` import to `settings/whatsapp-account/page.tsx`**

At the top of `apps/web/app/(dashboard)/settings/whatsapp-account/page.tsx`, add after the existing imports:

```typescript
import { EmbeddedSignupButton } from "@/components/whatsapp/EmbeddedSignupButton";
```

- [ ] **Step 4: Add the reconnect section to `WhatsAppAccountPage`**

Inside the `return (...)` of `WhatsAppAccountPage`, add this as the first `<section>` directly after the `<div>` that contains the `<h1>` title block (before the `{/* Health Status */}` comment):

```tsx
      {/* Connect / Reconnect */}
      <section className="border rounded-lg p-4 space-y-3">
        <div>
          <h2 className="font-medium">Connect / Reconnect</h2>
          <p className="text-sm text-gray-500">Update your WhatsApp Business Account connection.</p>
        </div>
        <EmbeddedSignupButton
          flow="reconnect"
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ["wa-health"] });
            void qc.invalidateQueries({ queryKey: ["wa-profile"] });
          }}
          onError={() => undefined}
        />
      </section>
```

- [ ] **Step 5: Type-check**

```bash
pnpm type-check
```
Expected: No errors.

- [ ] **Step 6: Run all API tests**

```bash
pnpm --filter @WBMSG/api test
```
Expected: All tests pass. (The pre-existing `analytics.test.ts` ECONNRESET failure is acceptable — it predates this work.)

- [ ] **Step 7: Commit**

```bash
git rm "apps/web/app/(onboarding)/connect-waba/callback/page.tsx"
git add apps/web/app/(dashboard)/settings/whatsapp-account/page.tsx
git commit -m "feat(web): add reconnect to settings, delete callback page (popup flow replaces redirect)"
```
