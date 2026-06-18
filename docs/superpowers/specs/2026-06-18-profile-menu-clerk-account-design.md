# Design: ProfileMenu — Manage Account (Clerk) Integration

**Date:** 2026-06-18  
**Status:** Approved

## Problem

The custom `ProfileMenu` popup replaced Clerk's `UserButton`, removing user access to Clerk-managed auth settings: name/email changes, password reset, MFA setup, and connected OAuth accounts.

## Solution

Add a **"Manage Account"** button to the existing `ProfileMenu` popup. Clicking it closes the popup and calls `clerk.openUserProfile()`, surfacing Clerk's full-screen profile modal in a portal overlay.

## Popup Structure (after change)

```
┌──────────────────────────────────────┐
│  USER DETAILS                        │
│  Avatar · Name · Online status       │
│  Availability toggle                 │
├──────────────────────────────────────┤
│  ACCOUNT SUMMARY                     │
│  Org card (name · plan · billing)    │
│  WhatsApp number                     │
├──────────────────────────────────────┤  ← new section
│  ⚙  Manage Account          →        │  ← opens Clerk modal
├──────────────────────────────────────┤
│  ⎋  Log Out                          │
└──────────────────────────────────────┘
```

## Behaviour

1. User opens popup via avatar click — no change to existing flow.
2. User clicks **Manage Account** → popup closes (`setOpen(false)`) + `clerk.openUserProfile()` fires.
3. Clerk's modal renders in a portal (z-index above all app content): name, email, password, MFA, connected accounts.
4. User closes Clerk modal → returns to app; popup stays closed.

## Implementation Scope

| File | Change |
|---|---|
| `apps/web/components/layout/ProfileMenu.tsx` | Destructure `openUserProfile` from `useClerk()`; add new "Manage Account" section (~8 lines) |

No new files. No API changes. No schema changes. No Clerk appearance customisation needed.

## Out of Scope

- Styling Clerk's modal to match WBMSG theme (Clerk's default is acceptable)
- Embedding `<UserProfile />` inline (rejected: layout/styling complexity)
