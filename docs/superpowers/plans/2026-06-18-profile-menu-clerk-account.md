# ProfileMenu — Manage Account (Clerk) Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Manage Account" button to the ProfileMenu popup that opens Clerk's full-screen user profile modal (name, email, password, MFA, connected accounts).

**Architecture:** `useClerk()` already provides `openUserProfile()` — we destructure it alongside the existing `signOut`. A new panel section renders a button that closes the popup and calls `openUserProfile()`. No new files, no API changes.

**Tech Stack:** Next.js 15, React 18, Clerk (`@clerk/nextjs ^7.2.7`), Tailwind CSS

## Global Constraints

- TypeScript strict mode — no `any`, no implicit returns
- No `console.log`
- Named exports only
- Tailwind for all styling — no inline styles
- Conventional commit format: `feat(scope): description`

---

### Task 1: Add "Manage Account" button to ProfileMenu

**Files:**
- Modify: `apps/web/components/layout/ProfileMenu.tsx`

**Interfaces:**
- Consumes: `openUserProfile` from `useClerk()` — `() => void`
- Produces: nothing consumed by other tasks

- [ ] **Step 1: Destructure `openUserProfile` from `useClerk()`**

In `apps/web/components/layout/ProfileMenu.tsx`, line 38, update:

```tsx
// Before
const { signOut } = useClerk();

// After
const { signOut, openUserProfile } = useClerk();
```

- [ ] **Step 2: Add the "Manage Account" section to the panel**

In the JSX, between the closing `</div>` of the `{/* ACCOUNT SUMMARY */}` section (line ~233) and the opening `<div>` of `{/* Log Out */}` (line ~235), insert:

```tsx
{/* Manage Account */}
<div className="px-5 py-3 border-b border-gray-100">
  <button
    onClick={() => { setOpen(false); openUserProfile(); }}
    className="flex items-center justify-between w-full text-sm text-gray-700 hover:text-gray-900 py-1 transition-colors"
  >
    <span className="flex items-center gap-2">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
      Manage Account
    </span>
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  </button>
</div>
```

- [ ] **Step 3: Run TypeScript check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: no errors.

- [ ] **Step 4: Manual verification**

Start the dev stack:
```bash
pnpm dev
```

Open `http://localhost:3000` (any dashboard page). Then:

1. Click the avatar button in the top-right header.
2. Confirm the popup shows: User Details → Account Summary → **Manage Account** → Log Out.
3. Click **Manage Account**.
4. Confirm: popup closes immediately AND Clerk's profile modal opens (shows tabs for Profile, Security, etc.).
5. Close the Clerk modal. Confirm the page returns to normal — no ghost overlay, popup stays closed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/layout/ProfileMenu.tsx
git commit -m "feat(layout): add Manage Account button to ProfileMenu opening Clerk profile modal"
```
