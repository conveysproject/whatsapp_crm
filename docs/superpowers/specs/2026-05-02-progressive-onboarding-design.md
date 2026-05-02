# Progressive Onboarding — Design Spec

**Date:** 2026-05-02  
**Author:** Product / Claude  
**Status:** Approved

---

## Problem

The current onboarding flow hard-gates the entire dashboard behind WhatsApp Business Account (WABA) setup. Users must complete Meta OAuth, phone provisioning, and number registration before seeing the product. This creates high drop-off because:

- Meta WABA setup can take hours or days (business verification, Meta review)
- Users never reach the "aha moment" (contacts, deals, pipeline) before hitting a complex third-party dependency
- ~60–70% of the product is usable without a live WhatsApp connection

---

## Goal

Send users to the dashboard immediately after signup. Gate only the two features that genuinely require WhatsApp (Inbox, Campaigns). Prompt WhatsApp setup contextually rather than as a prerequisite.

---

## User Flows

### New User (post-change)
```
Sign up (Clerk) → Business Details (/business-details) → Dashboard (/dashboard)
  └─ Setup banner visible on dashboard until WABA + phone done
  └─ Inbox → WhatsApp gate modal if not connected
  └─ Campaigns → WhatsApp gate modal if not connected
  └─ All other features: work immediately
```

### Returning User (WABA not yet connected)
```
Login → Dashboard
  └─ Banner still visible
  └─ Same feature gates apply
```

### WABA Setup Complete
```
Banner disappears automatically
Inbox and Campaigns unlock — no modal
```

---

## Architecture: Approach A (Server layout + React context)

The dashboard layout (server component) fetches onboarding status once and passes it into a client-side React context provider. All dashboard children read status via a `useOnboardingStatus()` hook. Zero additional API calls.

---

## Components

### 1. `app/(dashboard)/onboarding-context.tsx` — NEW

**Type:** `"use client"` — React context + provider

**Shape:**
```typescript
interface OnboardingStatus {
  provisioned: boolean
  wabaConnected: boolean
  numberProvisioned: boolean
  allDone: boolean  // computed: wabaConnected && numberProvisioned
}
```

**Exports:**
- `OnboardingProvider` — wraps children, accepts `{ provisioned, wabaConnected, numberProvisioned }` (raw API fields); computes `allDone` internally
- `useOnboardingStatus()` — hook returning full `OnboardingStatus` including `allDone`; throws if used outside provider

---

### 2. `components/SetupBanner.tsx` — NEW

**Type:** `"use client"`

**Behaviour:**
- Reads `useOnboardingStatus()`
- Renders nothing if `allDone === true`
- Renders nothing if `localStorage.getItem("setup_banner_dismissed") === "1"` (user dismissed — respects their choice until next session or until allDone clears it)
- Dismiss (X) button sets `localStorage` key `setup_banner_dismissed=1` and hides banner
- When `allDone` flips to `true`: clears `localStorage` key `setup_banner_dismissed` (so if they reconnect a different org later, banner reappears correctly)
- "Complete setup" link → `/checklist`

**Placement:** Inside `(dashboard)/layout.tsx`, above `{children}`, below TopBar.

**Styling:** Amber/yellow top strip (`bg-amber-50 border-b border-amber-200`), full width, compact height (~44px). Text + link on the left, dismiss X on the right.

**Content:**
> "Finish setting up WhatsApp to unlock Inbox and Campaigns. [Complete setup →]"

---

### 3. `components/WhatsAppGate.tsx` — NEW

**Type:** `"use client"`

**Props:**
```typescript
interface WhatsAppGateProps {
  feature: "Inbox" | "Campaigns"
  children: React.ReactNode
}
```

**Behaviour:**
- If `wabaConnected`: renders `children` normally
- If `!wabaConnected`:
  - Renders `children` underneath (blurred, `pointer-events-none`, `select-none`)
  - Renders a centered modal overlay on top
  - Modal is NOT dismissible on Inbox (user must navigate away)
  - Modal IS dismissible on Campaigns (secondary "Maybe later" button hides overlay for the session via `useState`)

**Modal content:**
- WhatsApp icon + heading: `"Connect WhatsApp to use {feature}"`
- Body: `"Link your WhatsApp Business Account to start messaging your contacts."`
- Primary CTA: `"Connect WhatsApp"` → `router.push("/connect-waba")`
- Secondary (Campaigns only): `"Maybe later"` → dismiss

**Why different dismissal per feature:**
- Inbox without WABA is entirely empty — showing it is misleading
- Campaigns list can show existing campaigns (created pre-connection), so glimpsing it is useful

---

## File Changes

| File | Change |
|------|--------|
| `app/(dashboard)/layout.tsx` | Remove `!provisioned` and `!wabaConnected` redirects. Add `numberProvisioned` to `getOrgStatus`. Wrap render with `<OnboardingProvider>` and add `<SetupBanner />`. |
| `app/(setup)/business-details/page.tsx` | Change post-submit redirect from `/checklist` → `/dashboard` (line ~147). |
| `app/(dashboard)/inbox/page.tsx` | Wrap page content with `<WhatsAppGate feature="Inbox">`. |
| `app/(dashboard)/campaigns/page.tsx` | Wrap page content with `<WhatsAppGate feature="Campaigns">`. |
| `app/(dashboard)/campaigns/new/page.tsx` | Wrap page content with `<WhatsAppGate feature="Campaigns">`. |
| `app/(dashboard)/onboarding-context.tsx` | New file — context + provider + hook. |
| `components/WhatsAppGate.tsx` | New file — gate modal component. |
| `components/SetupBanner.tsx` | New file — setup progress banner. |

**`middleware.ts` — no change.** The `tc_registered` cookie gate stays: it correctly catches users who signed up via Clerk but never submitted business details (they'd have no org, but the middleware catches them before they hit the dashboard layout).

---

## What Is NOT Gated

These features work without WABA and are fully accessible from day one:

- Contacts, Contact Segments, Contact Import
- Companies
- Deals / Pipeline
- Message Templates (draft and manage)
- Flows (build automation flows)
- Settings (profile, members, billing, routing)
- Dashboard analytics (shows empty state naturally)

---

## `getOrgStatus` Extension

Current shape returned by dashboard layout:
```typescript
{ provisioned: boolean; wabaConnected: boolean }
```

Extended shape (add `numberProvisioned` from `/v1/onboarding/status`):
```typescript
{ provisioned: boolean; wabaConnected: boolean; numberProvisioned: boolean }
```

`allDone` is computed client-side in the provider: `wabaConnected && numberProvisioned`.

---

## Error Handling

- If `getOrgStatus` fetch fails: defaults all fields to `false` (existing behaviour). Banner shows, gates active — safe degraded state.
- If user has no org (`!orgSlug`): redirect to `/checklist` as today (unchanged).

---

## Out of Scope

- Role-based feature permissions (admin vs agent) — separate concern
- Animated banner transitions
- Onboarding completion celebration/confetti
- Checklist page UI changes (it stays as-is, just no longer a forced wall)
