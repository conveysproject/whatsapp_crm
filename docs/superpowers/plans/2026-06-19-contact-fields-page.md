# Contact Fields Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/settings/contact-fields` tabbed settings page whose Fields tab shows read-only Default Fields alongside the existing editable Custom Fields manager, add a settings tile linking to it, and redirect the old custom-fields route into it.

**Architecture:** A server component (`page.tsx`) auth-guards and renders a client tab component (`ContactFieldsClient.tsx`) whose active tab is synced to `?tab=`. Only the Fields tab has content (composed from `DefaultFieldsPanel` + `CustomFieldsManager`); the other three render a shared `ComingSoon` placeholder. No backend changes — the Custom Fields manager reuses the existing `/v1/contacts/custom-fields` API.

**Tech Stack:** Next.js 15 App Router, React 18, Tailwind CSS, @tanstack/react-query, @clerk/nextjs, Vitest (newly added to web for pure-logic tests).

## Global Constraints

- TypeScript strict mode — no `any`, no implicit returns.
- Tailwind for all styling — no inline styles.
- No `console.log`.
- Route lives under `apps/web/app/(dashboard)/` so it inherits the dashboard layout (TopBar etc.).
- Page header title: "Contact Settings"; subtitle: "Setup the fields and configuration for your contacts."
- Settings tile label: "Contact Fields"; tile description: "Default & custom contact fields".
- Default tab when `?tab=` is missing or unknown: `fields`.
- Tab keys and labels (in order): `lead-statuses`→"Lead Statuses", `fields`→"Fields", `basic-config`→"Basic Configuration", `assignment-rules`→"Account Owner Assignment Rules".
- Custom Fields API base: `process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"`; React Query keys `custom-fields-all` and `custom-fields` must be preserved.

---

### Task 1: Default fields config + web Vitest setup

**Files:**
- Create: `apps/web/app/(dashboard)/settings/contact-fields/tabs/defaultFields.ts`
- Create: `apps/web/app/(dashboard)/settings/contact-fields/tabs/defaultFields.test.ts`
- Create: `apps/web/vitest.config.ts`
- Modify: `apps/web/package.json` (add `vitest` devDependency + `"test"` script)

**Interfaces:**
- Produces: `interface DefaultField { label: string; key: string; type: string }`, `const DEFAULT_FIELDS: DefaultField[]`, `const EXCLUDED_KEYS: string[]`.

- [ ] **Step 1: Add vitest to the web workspace**

Run: `pnpm --filter @WBMSG/web add -D vitest`
Expected: `vitest` appears under `devDependencies` in `apps/web/package.json`.

- [ ] **Step 2: Add the web test script**

In `apps/web/package.json`, add to the `"scripts"` object (after `"type-check"`):

```json
    "test": "vitest run",
```

- [ ] **Step 3: Create the web vitest config**

Create `apps/web/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts", "components/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the failing test**

Create `apps/web/app/(dashboard)/settings/contact-fields/tabs/defaultFields.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_FIELDS, EXCLUDED_KEYS } from "./defaultFields";

describe("DEFAULT_FIELDS", () => {
  it("lists the 19 user-facing contact fields", () => {
    expect(DEFAULT_FIELDS).toHaveLength(19);
  });

  it("includes core fields with correct keys and types", () => {
    const byKey = Object.fromEntries(DEFAULT_FIELDS.map((f) => [f.key, f]));
    expect(byKey["phone_number"]).toEqual({ label: "Phone Number", key: "phone_number", type: "Number" });
    expect(byKey["lifecycle_stage"]).toEqual({ label: "Status", key: "lifecycle_stage", type: "Selection List" });
    expect(byKey["email"]).toEqual({ label: "Email", key: "email", type: "Email" });
  });

  it("excludes confidential / internal database fields", () => {
    const keys = new Set(DEFAULT_FIELDS.map((f) => f.key));
    for (const excluded of EXCLUDED_KEYS) {
      expect(keys.has(excluded)).toBe(false);
    }
    expect(EXCLUDED_KEYS).toEqual([
      "id", "organization_id", "custom_fields", "country_id", "wa_id", "past_ai_summary", "deleted_at",
    ]);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter @WBMSG/web exec vitest run "app/(dashboard)/settings/contact-fields/tabs/defaultFields.test.ts"`
Expected: FAIL — cannot resolve `./defaultFields`.

- [ ] **Step 6: Implement the config**

Create `apps/web/app/(dashboard)/settings/contact-fields/tabs/defaultFields.ts`:

```ts
export interface DefaultField {
  label: string;
  key: string;
  type: string;
}

// User-facing Contact columns surfaced read-only in the Default Fields panel.
export const DEFAULT_FIELDS: DefaultField[] = [
  { label: "Name", key: "name", type: "Text" },
  { label: "First Name", key: "first_name", type: "Text" },
  { label: "Last Name", key: "last_name", type: "Text" },
  { label: "Phone Number", key: "phone_number", type: "Number" },
  { label: "Email", key: "email", type: "Email" },
  { label: "Status", key: "lifecycle_stage", type: "Selection List" },
  { label: "Language", key: "language_code", type: "Text" },
  { label: "Country Code", key: "country_code", type: "Text" },
  { label: "Username", key: "username", type: "Text" },
  { label: "Tags", key: "tags", type: "Tags" },
  { label: "Notes", key: "notes", type: "Text" },
  { label: "Account Owner", key: "assigned_user_id", type: "Selection List" },
  { label: "WhatsApp Opted Out", key: "whatsapp_opt_out", type: "Boolean" },
  { label: "Bot Disabled", key: "disable_bot", type: "Boolean" },
  { label: "WA Blocked At", key: "wa_blocked_at", type: "Date" },
  { label: "Phone Verified At", key: "phone_verified_at", type: "Date" },
  { label: "External ID", key: "external_id", type: "Text" },
  { label: "Created Date", key: "created_at", type: "Date" },
  { label: "Updated Date", key: "updated_at", type: "Date" },
];

// Confidential / internal columns intentionally NOT shown to users.
export const EXCLUDED_KEYS: string[] = [
  "id", "organization_id", "custom_fields", "country_id", "wa_id", "past_ai_summary", "deleted_at",
];
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @WBMSG/web exec vitest run "app/(dashboard)/settings/contact-fields/tabs/defaultFields.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 8: Type-check**

Run: `pnpm --filter @WBMSG/web type-check`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/package.json apps/web/app/"(dashboard)"/settings/contact-fields/tabs/defaultFields.ts apps/web/app/"(dashboard)"/settings/contact-fields/tabs/defaultFields.test.ts
git commit -m "feat(settings): add default contact-fields config + web vitest setup"
```

---

### Task 2: DefaultFieldsPanel + CustomFieldsManager components

**Files:**
- Create: `apps/web/app/(dashboard)/settings/contact-fields/tabs/DefaultFieldsPanel.tsx`
- Create: `apps/web/app/(dashboard)/settings/contact-fields/tabs/CustomFieldsManager.tsx`
- Reference (source to move): `apps/web/app/(dashboard)/settings/custom-fields/page.tsx`

**Interfaces:**
- Consumes: `DEFAULT_FIELDS` from `./defaultFields`.
- Produces: `DefaultFieldsPanel` (default export, no props), `CustomFieldsManager` (default export, no props).

- [ ] **Step 1: Create the DefaultFieldsPanel**

Create `apps/web/app/(dashboard)/settings/contact-fields/tabs/DefaultFieldsPanel.tsx`:

```tsx
"use client";

import { JSX, useRef, useState } from "react";
import { DEFAULT_FIELDS } from "./defaultFields";

function CopyKey({ value }: { value: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function copy() {
    void navigator.clipboard.writeText(value);
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 font-mono"
      title="Copy API keyname"
    >
      {value}
      <span className="text-[10px]">{copied ? "✓" : "⧉"}</span>
    </button>
  );
}

export default function DefaultFieldsPanel(): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200">
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Default Fields</p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">
        <span>Field Label</span>
        <span>Type</span>
      </div>
      <div className="divide-y divide-gray-50">
        {DEFAULT_FIELDS.map((f) => (
          <div key={f.key} className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-3 items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">{f.label}</p>
              <CopyKey value={f.key} />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{f.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Move the Custom Fields manager into a component**

Create `apps/web/app/(dashboard)/settings/contact-fields/tabs/CustomFieldsManager.tsx` by moving the implementation currently in `apps/web/app/(dashboard)/settings/custom-fields/page.tsx` (lines 1–489). Apply exactly these changes to the moved code:
- Rename the default-exported function from `CustomFieldsPage` to `CustomFieldsManager`.
- Keep ALL other code identical: the `CustomField`/`FieldFormState` interfaces, `EMPTY_FORM`, `INPUT_TYPES`, `toFieldKey`, the `Toggle` component, every hook, the React Query keys (`custom-fields-all`, `custom-fields`), the API URL constant, the list rendering, and the add/edit modal.
- In the returned JSX, change the outer wrapper `className` from `"max-w-3xl space-y-6"` to `"space-y-4"` (it now sits inside a tab column, not a full page), and change the heading block: replace `<h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>` and its sibling `<p>` with `<p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Custom Fields</p>` (keep the "Add Field" button exactly as-is in the same flex row).

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @WBMSG/web type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/"(dashboard)"/settings/contact-fields/tabs/DefaultFieldsPanel.tsx apps/web/app/"(dashboard)"/settings/contact-fields/tabs/CustomFieldsManager.tsx
git commit -m "feat(settings): add DefaultFieldsPanel and extract CustomFieldsManager"
```

---

### Task 3: FieldsTab composer + ComingSoon placeholder

**Files:**
- Create: `apps/web/app/(dashboard)/settings/contact-fields/tabs/FieldsTab.tsx`
- Create: `apps/web/app/(dashboard)/settings/contact-fields/tabs/ComingSoon.tsx`

**Interfaces:**
- Consumes: `DefaultFieldsPanel`, `CustomFieldsManager` (default exports, no props).
- Produces: `FieldsTab` (default export, no props), `ComingSoon` (default export, props `{ label: string }`).

- [ ] **Step 1: Create the ComingSoon placeholder**

Create `apps/web/app/(dashboard)/settings/contact-fields/tabs/ComingSoon.tsx`:

```tsx
import { JSX } from "react";

export default function ComingSoon({ label }: { label: string }): JSX.Element {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
      <p className="text-sm font-medium text-gray-900">{label}</p>
      <p className="text-xs text-gray-400 mt-1">Coming soon.</p>
    </div>
  );
}
```

- [ ] **Step 2: Create the FieldsTab composer**

Create `apps/web/app/(dashboard)/settings/contact-fields/tabs/FieldsTab.tsx`:

```tsx
import { JSX } from "react";
import DefaultFieldsPanel from "./DefaultFieldsPanel";
import CustomFieldsManager from "./CustomFieldsManager";

export default function FieldsTab(): JSX.Element {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-3">
        <DefaultFieldsPanel />
      </div>
      <div className="lg:col-span-2">
        <CustomFieldsManager />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm --filter @WBMSG/web type-check`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/"(dashboard)"/settings/contact-fields/tabs/ComingSoon.tsx apps/web/app/"(dashboard)"/settings/contact-fields/tabs/FieldsTab.tsx
git commit -m "feat(settings): add FieldsTab composer and ComingSoon placeholder"
```

---

### Task 4: ContactFieldsClient tab shell (URL-synced)

**Files:**
- Create: `apps/web/app/(dashboard)/settings/contact-fields/ContactFieldsClient.tsx`

**Interfaces:**
- Consumes: `FieldsTab`, `ComingSoon` (default exports).
- Produces: `ContactFieldsClient` (named export, no props).

- [ ] **Step 1: Create the tab shell**

Create `apps/web/app/(dashboard)/settings/contact-fields/ContactFieldsClient.tsx`:

```tsx
"use client";

import { JSX } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import FieldsTab from "./tabs/FieldsTab";
import ComingSoon from "./tabs/ComingSoon";

const TABS = [
  { key: "lead-statuses", label: "Lead Statuses" },
  { key: "fields", label: "Fields" },
  { key: "basic-config", label: "Basic Configuration" },
  { key: "assignment-rules", label: "Account Owner Assignment Rules" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

export function ContactFieldsClient(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("tab");
  const active: TabKey = isTabKey(raw) ? raw : "fields";

  function selectTab(key: TabKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-6 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={[
              "pb-3 text-sm font-medium border-b-2 transition-colors -mb-px",
              active === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-500 hover:text-gray-700",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "fields" ? <FieldsTab /> : <ComingSoon label={TABS.find((t) => t.key === active)!.label} />}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm --filter @WBMSG/web type-check`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/"(dashboard)"/settings/contact-fields/ContactFieldsClient.tsx
git commit -m "feat(settings): add ContactFieldsClient tab shell with URL sync"
```

---

### Task 5: Page wrapper, settings tile, and old-route redirect

**Files:**
- Create: `apps/web/app/(dashboard)/settings/contact-fields/page.tsx`
- Modify: `apps/web/app/(dashboard)/settings/page.tsx` (tile grid array, around lines 44–59)
- Replace: `apps/web/app/(dashboard)/settings/custom-fields/page.tsx` (full file → redirect)

**Interfaces:**
- Consumes: `ContactFieldsClient` (named export).

- [ ] **Step 1: Create the page server wrapper**

Create `apps/web/app/(dashboard)/settings/contact-fields/page.tsx`:

```tsx
import type { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import { Suspense } from "react";
import { ContactFieldsClient } from "./ContactFieldsClient";

export default async function ContactFieldsPage(): Promise<JSX.Element> {
  await auth.protect();
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contact Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Setup the fields and configuration for your contacts.</p>
      </div>
      <Suspense fallback={null}>
        <ContactFieldsClient />
      </Suspense>
    </div>
  );
}
```

(Note: `ContactFieldsClient` uses `useSearchParams`, which Next.js requires to be wrapped in `<Suspense>`.)

- [ ] **Step 2: Add the settings tile**

In `apps/web/app/(dashboard)/settings/page.tsx`, inside the tile array (the list of `{ href, label, desc }` objects), add this entry immediately after the `/settings/labels` entry:

```tsx
          { href: "/settings/contact-fields", label: "Contact Fields", desc: "Default & custom contact fields" },
```

- [ ] **Step 3: Replace the old custom-fields page with a redirect**

Replace the ENTIRE contents of `apps/web/app/(dashboard)/settings/custom-fields/page.tsx` with:

```tsx
import { redirect } from "next/navigation";

export default function CustomFieldsRedirect(): never {
  redirect("/settings/contact-fields?tab=fields");
}
```

- [ ] **Step 4: Type-check**

Run: `pnpm --filter @WBMSG/web type-check`
Expected: no errors.

- [ ] **Step 5: Build to verify routing + Suspense boundary**

Run: `pnpm --filter @WBMSG/web build`
Expected: build succeeds; `/settings/contact-fields` and `/settings/custom-fields` both compile with no `useSearchParams`/Suspense errors.

- [ ] **Step 6: Manual smoke (document result in report)**

Start dev (`pnpm dev`), then verify:
1. `/settings` shows a "Contact Fields" tile; clicking it opens `/settings/contact-fields` on the Fields tab.
2. Default Fields panel lists all 19 fields with copy-able keynames; Custom Fields add/edit/toggle still works.
3. The other three tabs show "Coming soon"; switching tabs updates `?tab=` in the URL.
4. Visiting `/settings/custom-fields` redirects to `/settings/contact-fields?tab=fields`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/"(dashboard)"/settings/contact-fields/page.tsx apps/web/app/"(dashboard)"/settings/page.tsx apps/web/app/"(dashboard)"/settings/custom-fields/page.tsx
git commit -m "feat(settings): wire Contact Fields page, add tile, redirect old custom-fields route"
```

---

## Self-Review

**Spec coverage:**
- Page shell + tabs (4, Fields default) → Tasks 3, 4, 5 ✓
- Settings tile "Contact Fields" → Task 5 ✓
- Default Fields panel (19 user-facing fields, excludes confidential) → Tasks 1, 2 ✓
- Custom Fields manager moved verbatim, query keys preserved → Task 2 ✓
- Two-column responsive layout (3/2 split, stacks on mobile) → Task 3 ✓
- ComingSoon for 3 future tabs → Tasks 3, 4 ✓
- Old `/settings/custom-fields` redirects to `?tab=fields` → Task 5 ✓
- Unit test on defaultFields → Task 1 ✓ (required adding web vitest, noted)
- No backend changes ✓

**Placeholder scan:** none — all steps contain concrete code or exact instructions. The one verbatim file-move (Task 2 Step 2) cites exact source line ranges and the precise edits rather than reproducing 489 unchanged lines.

**Type consistency:** `DefaultField`/`DEFAULT_FIELDS`/`EXCLUDED_KEYS` (Task 1) consumed in Task 2; `DefaultFieldsPanel`/`CustomFieldsManager` (Task 2) consumed in Task 3; `FieldsTab`/`ComingSoon` (Task 3) consumed in Task 4; `ContactFieldsClient` named export (Task 4) consumed in Task 5. All consistent.
