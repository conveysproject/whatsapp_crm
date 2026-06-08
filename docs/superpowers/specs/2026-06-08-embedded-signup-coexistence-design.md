# Embedded Signup + Coexistence Design

**Date:** 2026-06-08  
**Scope:** Replace redirect-based WhatsApp onboarding with Facebook JS SDK popup, add coexistence (SMB) mode, consolidate duplicate backend endpoints, surface reconnect in Settings.

---

## Problem

Three issues with the current implementation:

1. **Redirect-based UX** — `connect-waba/page.tsx` sends the user away to `facebook.com/dialog/oauth` and handles the code on a separate callback page. The Facebook Embedded Signup JS SDK provides an inline popup that is faster, doesn't lose page context, and is Meta's recommended approach.

2. **Data inconsistency** — Two overlapping backend endpoints write different things. `POST /onboarding/waba-callback` updates the `Organization` model. `POST /whatsapp-account/embedded-signup` only writes to `VendorSettings`. A user reconnecting via Settings today leaves `Organization.wabaAccessToken`, `Organization.whatsappBusinessAccountId`, and `Organization.phoneNumberId` stale.

3. **No reconnect UI in Settings** — `settings/whatsapp-account` has no way to connect or reconnect; only manage an existing connection.

---

## Solution

One shared `EmbeddedSignupButton` component (FB JS SDK popup) used in both the onboarding wizard and the Settings page. One canonical `POST /whatsapp-account/connect` endpoint that always writes to both `Organization` and `VendorSettings`.

---

## Architecture

```
EmbeddedSignupButton (shared client component)
  ├── Loads FB JS SDK on mount
  ├── Coexistence toggle (hidden if NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID unset)
  ├── "Connect with Meta" button → FB.login() popup
  ├── window.postMessage listener → captures wabaId, phoneNumberId
  └── POST /api/v1/whatsapp-account/connect → calls onSuccess / onError prop

Onboarding wizard (connect-waba/page.tsx)
  └── <EmbeddedSignupButton flow="onboarding" onSuccess={handleSuccess} />
        └── handleSuccess: phoneNumberId present → /checklist, else → /provision-number

Settings page (settings/whatsapp-account/page.tsx)
  └── <EmbeddedSignupButton flow="reconnect" onSuccess={handleSuccess} />
        └── handleSuccess: invalidate wa-health + wa-profile queries
```

---

## Component: `EmbeddedSignupButton`

**Path:** `apps/web/components/whatsapp/EmbeddedSignupButton.tsx`

**Props:**
```typescript
interface EmbeddedSignupButtonProps {
  flow: "onboarding" | "reconnect";
  onSuccess: (result: ConnectResult) => void;
  onError: (message: string) => void;
}

interface ConnectResult {
  wabaId: string;
  wabaName: string;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
}
```

**Internal state:** `isSMB: boolean`, `loading: boolean`, `fbReady: boolean`

**FB SDK initialization:**
- `useEffect` injects `https://connect.facebook.net/en_US/sdk.js` script on mount
- On script load: `FB.init({ appId: NEXT_PUBLIC_META_APP_ID, version: "v25.0" })`
- Sets `fbReady = true`

**postMessage capture:**
- `useEffect` registers `window.addEventListener("message", onPostMessage)` on mount, removes on unmount
- Looks for `{ type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id, phone_number_id } }`
- Stores captured `wabaId` and `phoneNumberId` in refs (not state — avoids stale closure in the FB.login callback)

**Connect flow:**
1. Set `loading = true`
2. Call `FB.login(callback, { config_id, response_type: "code", override_default_response_type: true })`
   - `config_id`: `isSMB ? NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID : NEXT_PUBLIC_META_CONFIG_ID`
3. In callback: extract `authResponse.code`
4. `POST /api/v1/whatsapp-account/connect` with `{ code, wabaId, phoneNumberId, isSMB, flow }`
5. Call `onSuccess(result)` or `onError(message)`, set `loading = false`

**Coexistence toggle:**
- Renders only if `process.env.NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID` is non-empty
- Label: "I already use the WhatsApp Business App"
- Default: unchecked

**Button:** Facebook blue (`#1877F2`), full-width, disabled while `loading || !fbReady`

**Error display:** Inline error message below button when `onError` has been called

---

## Backend: `POST /v1/whatsapp-account/connect`

**File:** `apps/api/src/routes/whatsapp-account.ts`  
**Replaces:** `POST /whatsapp-account/embedded-signup` and `POST /onboarding/waba-callback`

**Request body:**
```typescript
{
  code: string;             // required — from FB.login authResponse.code
  wabaId?: string;          // from postMessage WA_EMBEDDED_SIGNUP event
  phoneNumberId?: string;   // from postMessage WA_EMBEDDED_SIGNUP event
  isSMB?: boolean;          // coexistence mode, default false
  flow?: "onboarding" | "reconnect";  // default "reconnect"
}
```

**Response:**
```typescript
{
  data: {
    wabaId: string;
    wabaName: string;
    phoneNumberId: string | null;
    displayPhoneNumber: string | null;
  }
}
```

**Processing steps:**

1. **Validate** — return 400 if `code` missing; 500 if `META_APP_ID` / `META_APP_SECRET` not set

2. **Token exchange** — `GET /oauth/access_token?client_id=&client_secret=&code=`  
   Return 400 with Meta's error message on failure

3. **Resolve WABA ID**  
   - Use `wabaId` from body if present  
   - Fallback: call `GET /debug_token` to extract WABA ID from `granular_scopes[whatsapp_business_messaging].target_ids[0]`  
   - Return 400 `NO_WABA` if still unresolved

4. **Resolve phone number**  
   - Use `phoneNumberId` from body if present, fetch `display_phone_number` from `/{phoneNumberId}?fields=display_phone_number`  
   - Fallback: `GET /{wabaId}/phone_numbers?fields=id,display_phone_number,verified_name`, use first result  
   - Phone is optional — if none found, continue without error

5. **Subscribe webhooks** — `POST /{wabaId}/subscribed_apps` with `subscribed_fields` array  
   Fire-and-forget (failure is non-fatal)

6. **Coexistence** — if `isSMB`: `POST /{wabaId}/smb_app_data { sync_type: "full" }`  
   Fire-and-forget

7. **Persist — Organization model:**
   ```
   wabaAccessToken = accessToken
   whatsappBusinessAccountId = wabaId
   phoneNumberId = phoneNumberId (if present)
   onboardingStep = flow === "onboarding"
     ? (phoneNumberId ? "done" : "provision_number")
     : (unchanged)
   ```

8. **Persist — VendorSettings (upsert all):**
   ```
   whatsapp_access_token
   whatsapp_business_account_id
   current_phone_number_id       (if phoneNumberId present)
   current_phone_number_number   (if displayPhoneNumber present)
   webhook_verified_at
   facebook_app_id
   whatsapp_access_token_expired = "0"
   ```

9. **Return** response body

**Auth guard:** Requires authenticated user (`request.auth`). No additional role check — any member can connect/reconnect (same as current behavior).

---

## `onboarding.ts` Changes

- **Remove** `POST /waba-callback` — replaced by `/whatsapp-account/connect`
- **Keep** `GET /status` — wizard progress check, unchanged
- **Keep** `POST /sync-phone` — "Number is ready" button on provision-number page, unchanged

---

## File Map

| Action | Path | Notes |
|--------|------|-------|
| Create | `apps/web/components/whatsapp/EmbeddedSignupButton.tsx` | Shared component |
| Modify | `apps/web/app/(onboarding)/connect-waba/page.tsx` | Use EmbeddedSignupButton |
| Delete | `apps/web/app/(onboarding)/connect-waba/callback/page.tsx` | No longer needed |
| Modify | `apps/web/app/(dashboard)/settings/whatsapp-account/page.tsx` | Add connect section |
| Modify | `apps/api/src/routes/whatsapp-account.ts` | Replace /embedded-signup with /connect |
| Modify | `apps/api/src/routes/onboarding.ts` | Remove /waba-callback |
| Modify | `apps/api/src/routes/whatsapp-account.test.ts` | Tests for /connect |
| Modify | `apps/api/src/routes/onboarding.test.ts` | Remove /waba-callback tests |

---

## Environment Variables

**Web (Next.js):**

| Variable | Status | Purpose |
|----------|--------|---------|
| `NEXT_PUBLIC_META_APP_ID` | Existing | FB App ID for SDK init |
| `NEXT_PUBLIC_META_CONFIG_ID` | Existing | Standard signup config |
| `NEXT_PUBLIC_META_COEXISTENCE_CONFIG_ID` | New, optional | Coexistence config; hides toggle if unset |
| `NEXT_PUBLIC_META_REDIRECT_URI` | **Remove** | Not needed with popup flow |

**API (Fastify):**

| Variable | Status | Purpose |
|----------|--------|---------|
| `META_APP_ID` | Existing | Token exchange + debug_token |
| `META_APP_SECRET` | Existing | Token exchange + debug_token |
| `META_REDIRECT_URI` | **Remove** | Not needed with popup flow |
| `API_PUBLIC_URL` | Existing | Webhook callback URL |

---

## Testing

**`whatsapp-account.test.ts` — new tests for `POST /connect`:**
- Returns 400 when `code` is missing
- Returns 400 when token exchange fails (mock Graph API 400)
- Returns 400 `NO_WABA` when `wabaId` absent and `debug_token` returns no WABA ID
- Happy path: saves to both `Organization` and `VendorSettings`
- `isSMB: true` triggers `smb_app_data` call
- `flow: "onboarding"` with phoneNumberId sets `onboardingStep = "done"`
- `flow: "onboarding"` without phoneNumberId sets `onboardingStep = "provision_number"`
- `flow: "reconnect"` does NOT update `onboardingStep`

**`onboarding.test.ts`:** Remove `/waba-callback` tests; `/status` and `/sync-phone` tests unchanged.

---

## What Does Not Change

- `provision-number/page.tsx` — unchanged; wizard still uses it for the "add phone in Meta Business Manager" step
- `onboarding/status` and `onboarding/sync-phone` endpoints — unchanged
- All other `whatsapp-account` endpoints (health, business-profile, display-name, sync-phone-numbers, etc.) — unchanged
- Webhook verification logic — unchanged
- `lib/whatsapp.ts` — unchanged
