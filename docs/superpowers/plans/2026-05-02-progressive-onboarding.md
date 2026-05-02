# Progressive Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the hard WABA gate from the dashboard so users land there after signup, with contextual WhatsApp gates only on Inbox and Campaigns.

**Architecture:** The dashboard server layout fetches onboarding status once and injects it into a React context provider. A `SetupBanner` reads the context to show a persistent (dismissible) amber strip until setup is done. A `WhatsAppGate` component wraps Inbox and Campaigns pages, showing a modal overlay when WABA is not yet connected.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript strict, Tailwind CSS 3, Clerk auth (`@clerk/nextjs` v7)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/web/app/(dashboard)/onboarding-context.tsx` | React context + provider + hook |
| Create | `apps/web/components/SetupBanner.tsx` | Amber strip banner, dismissible via localStorage |
| Create | `apps/web/components/WhatsAppGate.tsx` | Modal overlay gate for WhatsApp-dependent pages |
| Modify | `apps/web/app/(dashboard)/layout.tsx` | Remove hard redirects, add provider + banner |
| Modify | `apps/web/app/(dashboard)/inbox/page.tsx` | Wrap content in WhatsAppGate |
| Modify | `apps/web/app/(dashboard)/campaigns/page.tsx` | Wrap content in WhatsAppGate |
| Modify | `apps/web/app/(dashboard)/campaigns/new/page.tsx` | Wrap content in WhatsAppGate |
| Modify | `apps/web/app/(setup)/business-details/page.tsx` | Redirect to /dashboard instead of /checklist |

---

## Task 1: Create OnboardingContext

**Files:**
- Create: `apps/web/app/(dashboard)/onboarding-context.tsx`

- [ ] **Step 1: Create the context file**

Create `apps/web/app/(dashboard)/onboarding-context.tsx` with the following content:

```typescript
"use client";

import { createContext, useContext, JSX, ReactNode } from "react";

export interface OnboardingStatus {
  provisioned: boolean;
  wabaConnected: boolean;
  numberProvisioned: boolean;
  allDone: boolean;
}

const OnboardingContext = createContext<OnboardingStatus | null>(null);

interface ProviderProps {
  status: Omit<OnboardingStatus, "allDone">;
  children: ReactNode;
}

export function OnboardingProvider({ status, children }: ProviderProps): JSX.Element {
  const value: OnboardingStatus = {
    ...status,
    allDone: status.wabaConnected && status.numberProvisioned,
  };
  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboardingStatus(): OnboardingStatus {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboardingStatus must be used inside OnboardingProvider");
  return ctx;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @trustcrm/web type-check
```

Expected: no errors related to `onboarding-context.tsx`

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/onboarding-context.tsx
git commit -m "feat(web): add OnboardingContext for dashboard-wide setup status"
```

---

## Task 2: Create SetupBanner

**Files:**
- Create: `apps/web/components/SetupBanner.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/SetupBanner.tsx`:

```typescript
"use client";

import { JSX, useEffect, useState } from "react";
import Link from "next/link";
import { useOnboardingStatus } from "@/app/(dashboard)/onboarding-context";

const DISMISSED_KEY = "setup_banner_dismissed";

export function SetupBanner(): JSX.Element | null {
  const { allDone } = useOnboardingStatus();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
  }, []);

  useEffect(() => {
    if (allDone) {
      localStorage.removeItem(DISMISSED_KEY);
    }
  }, [allDone]);

  if (!mounted || allDone || dismissed) return null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-sm">
      <p className="text-amber-800">
        Finish setting up WhatsApp to unlock Inbox and Campaigns.{" "}
        <Link href="/checklist" className="font-semibold underline underline-offset-2 hover:text-amber-900">
          Complete setup →
        </Link>
      </p>
      <button
        aria-label="Dismiss setup banner"
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, "1");
          setDismissed(true);
        }}
        className="ml-4 text-amber-600 hover:text-amber-800 focus:outline-none"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @trustcrm/web type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/SetupBanner.tsx
git commit -m "feat(web): add SetupBanner component for progressive onboarding"
```

---

## Task 3: Create WhatsAppGate

**Files:**
- Create: `apps/web/components/WhatsAppGate.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/WhatsAppGate.tsx`:

```typescript
"use client";

import { JSX, ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useOnboardingStatus } from "@/app/(dashboard)/onboarding-context";

interface WhatsAppGateProps {
  feature: "Inbox" | "Campaigns";
  children: ReactNode;
}

export function WhatsAppGate({ feature, children }: WhatsAppGateProps): JSX.Element {
  const { wabaConnected } = useOnboardingStatus();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);

  if (wabaConnected) return <>{children}</>;

  const showChildren = feature === "Campaigns" && dismissed;

  if (showChildren) return <>{children}</>;

  return (
    <div className="flex-1 relative overflow-hidden min-h-0">
      <div className="absolute inset-0 pointer-events-none select-none opacity-30 blur-sm overflow-hidden">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/60 backdrop-blur-[2px]">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 max-w-sm w-full mx-4 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-green-500" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.562 4.14 1.541 5.877L.057 23.57a.75.75 0 00.916.919l5.765-1.498A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.698-.5-5.254-1.375l-.372-.214-3.852 1.001 1.026-3.748-.235-.386A9.956 9.956 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Connect WhatsApp to use {feature}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Link your WhatsApp Business Account to start messaging your contacts.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={() => router.push("/connect-waba")}>
              Connect WhatsApp
            </Button>
            {feature === "Campaigns" && (
              <Button variant="ghost" onClick={() => setDismissed(true)}>
                Maybe later
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @trustcrm/web type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/WhatsAppGate.tsx
git commit -m "feat(web): add WhatsAppGate modal for Inbox and Campaigns"
```

---

## Task 4: Update Dashboard Layout

**Files:**
- Modify: `apps/web/app/(dashboard)/layout.tsx`

Current file is 64 lines. Changes:
1. Extend `getOrgStatus` to also return `numberProvisioned`
2. Remove the `!provisioned` redirect (lines 44–46)
3. Remove the `!wabaConnected` redirect (lines 48–50)
4. Import `OnboardingProvider` and `SetupBanner`
5. Wrap render in `<OnboardingProvider>` and add `<SetupBanner />`

- [ ] **Step 1: Replace the entire layout file**

Replace `apps/web/app/(dashboard)/layout.tsx` with:

```typescript
import { JSX, ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { SetupBanner } from "@/components/SetupBanner";
import { OnboardingProvider } from "@/app/(dashboard)/onboarding-context";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

async function getOrgStatus(token: string): Promise<{
  provisioned: boolean;
  wabaConnected: boolean;
  numberProvisioned: boolean;
}> {
  try {
    const [orgRes, statusRes] = await Promise.all([
      fetch(`${API_URL}/v1/organizations/me`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
      fetch(`${API_URL}/v1/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }),
    ]);
    if (!orgRes.ok) return { provisioned: false, wabaConnected: false, numberProvisioned: false };
    const status = statusRes.ok
      ? (await statusRes.json() as { wabaConnected: boolean; numberProvisioned: boolean })
      : { wabaConnected: false, numberProvisioned: false };
    return {
      provisioned: true,
      wabaConnected: status.wabaConnected,
      numberProvisioned: status.numberProvisioned,
    };
  } catch {
    return { provisioned: false, wabaConnected: false, numberProvisioned: false };
  }
}

export default async function DashboardLayout({ children }: { children: ReactNode }): Promise<JSX.Element> {
  const { getToken, orgSlug } = await auth.protect();
  const token = await getToken();

  if (!orgSlug) {
    redirect("/checklist");
  }

  const status = await getOrgStatus(token ?? "");

  return (
    <OnboardingProvider status={status}>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <TopBar orgName={orgSlug ?? undefined} />
          <SetupBanner />
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </OnboardingProvider>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @trustcrm/web type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/layout.tsx
git commit -m "feat(web): remove WABA hard gate from dashboard layout, inject OnboardingProvider"
```

---

## Task 5: Gate the Inbox Page

**Files:**
- Modify: `apps/web/app/(dashboard)/inbox/page.tsx`

The inbox layout (`inbox/layout.tsx`) wraps children in `<div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">`. The page currently returns a fragment with two flex children. `WhatsAppGate` returns `<>{children}</>` when connected (preserving the flex layout) and a single `div.flex-1.relative` when gated.

- [ ] **Step 1: Add WhatsAppGate import and wrap the return**

Replace `apps/web/app/(dashboard)/inbox/page.tsx` with:

```typescript
"use client";

import { JSX, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ConversationList } from "@/components/inbox/ConversationList";
import { MessageThread } from "@/components/inbox/MessageThread";
import { SendMessageForm } from "@/components/inbox/SendMessageForm";
import { SmartReplies } from "@/components/inbox/SmartReplies";
import { WhatsAppGate } from "@/components/WhatsAppGate";
import { useSocket } from "@/hooks/useSocket";

export default function InboxPage(): JSX.Element {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [prefillText, setPrefillText] = useState("");
  const { orgId } = useAuth();

  useSocket(orgId ?? undefined);

  return (
    <WhatsAppGate feature="Inbox">
      <div className="w-72 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Conversations</h2>
        </div>
        <ConversationList
          selectedId={selectedConversationId}
          onSelect={setSelectedConversationId}
        />
      </div>

      <div className="flex flex-col flex-1 bg-gray-50 overflow-hidden">
        <MessageThread conversationId={selectedConversationId} />
        <SmartReplies
          conversationId={selectedConversationId}
          onSelect={(text) => setPrefillText(text)}
        />
        <SendMessageForm
          conversationId={selectedConversationId}
          prefillText={prefillText}
          onSent={() => setPrefillText("")}
        />
      </div>
    </WhatsAppGate>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @trustcrm/web type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(dashboard\)/inbox/page.tsx
git commit -m "feat(web): gate Inbox behind WhatsAppGate"
```

---

## Task 6: Gate the Campaigns Pages

**Files:**
- Modify: `apps/web/app/(dashboard)/campaigns/page.tsx`
- Modify: `apps/web/app/(dashboard)/campaigns/new/page.tsx`

`campaigns/page.tsx` is a server component. `WhatsAppGate` is a client component. In Next.js App Router, server components can render client components as children — the server-rendered JSX is passed as serialised `children` props.

- [ ] **Step 1: Update campaigns/page.tsx**

Replace `apps/web/app/(dashboard)/campaigns/page.tsx` with:

```typescript
import { JSX } from "react";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { WhatsAppGate } from "@/components/WhatsAppGate";

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
}

async function getCampaigns(token: string): Promise<Campaign[]> {
  try {
    const res = await fetch(
      `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/campaigns`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    return (await res.json() as { data: Campaign[] }).data;
  } catch { return []; }
}

const statusVariant: Record<string, "gray" | "yellow" | "blue" | "green" | "red"> = {
  draft: "gray",
  scheduled: "yellow",
  running: "blue",
  completed: "green",
  cancelled: "red",
};

export default async function CampaignsPage(): Promise<JSX.Element> {
  const { getToken } = await auth.protect();
  const campaigns = await getCampaigns(await getToken() ?? "");

  return (
    <WhatsAppGate feature="Campaigns">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Campaigns</h1>
          <Link href="/campaigns/new">
            <Button>New Campaign</Button>
          </Link>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-card divide-y divide-gray-100">
          {campaigns.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No campaigns yet.</p>
          ) : (
            campaigns.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  {c.scheduledAt && (
                    <p className="text-xs text-gray-500">
                      {new Date(c.scheduledAt).toLocaleString("en-IN")}
                    </p>
                  )}
                </div>
                <Badge variant={statusVariant[c.status] ?? "gray"}>{c.status}</Badge>
              </div>
            ))
          )}
        </div>
      </div>
    </WhatsAppGate>
  );
}
```

- [ ] **Step 2: Update campaigns/new/page.tsx**

Replace `apps/web/app/(dashboard)/campaigns/new/page.tsx` with:

```typescript
"use client";

import { JSX, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { WhatsAppGate } from "@/components/WhatsAppGate";

interface Option {
  id: string;
  name: string;
}

export default function NewCampaignPage(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [templates, setTemplates] = useState<Option[]>([]);
  const [segments, setSegments] = useState<Option[]>([]);
  const [form, setForm] = useState({ name: "", templateId: "", segmentId: "", scheduledAt: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const [tRes, sRes] = await Promise.all([
        fetch(`${api}/v1/templates`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
        fetch(`${api}/v1/segments`, { headers: { Authorization: `Bearer ${token ?? ""}` } }),
      ]);
      if (tRes.ok) setTemplates((await tRes.json() as { data: Option[] }).data);
      if (sRes.ok) setSegments((await sRes.json() as { data: Option[] }).data);
    }
    void load();
  }, [getToken]);

  async function handleSubmit() {
    setSaving(true);
    try {
      const token = await getToken();
      const api = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";
      const createRes = await fetch(`${api}/v1/campaigns`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, templateId: form.templateId }),
      });
      if (!createRes.ok) return;
      const { data } = await createRes.json() as { data: { id: string } };

      await fetch(`${api}/v1/campaigns/${data.id}/schedule`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentId: form.segmentId,
          scheduledAt: form.scheduledAt || undefined,
        }),
      });
      router.push("/campaigns");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WhatsAppGate feature="Campaigns">
      <div className="max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">New Campaign</h1>
        <Input
          label="Campaign Name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Template</label>
          <select
            value={form.templateId}
            onChange={(e) => setForm((f) => ({ ...f, templateId: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Audience Segment</label>
          <select
            value={form.segmentId}
            onChange={(e) => setForm((f) => ({ ...f, segmentId: e.target.value }))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Select a segment…</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Schedule At (optional)"
          type="datetime-local"
          value={form.scheduledAt}
          onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
        />
        <Button
          onClick={() => { void handleSubmit(); }}
          disabled={!form.name || !form.templateId || !form.segmentId || saving}
        >
          {saving ? "Scheduling…" : "Schedule Campaign"}
        </Button>
      </div>
    </WhatsAppGate>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter @trustcrm/web type-check
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(dashboard\)/campaigns/page.tsx apps/web/app/\(dashboard\)/campaigns/new/page.tsx
git commit -m "feat(web): gate Campaigns pages behind WhatsAppGate"
```

---

## Task 7: Fix Post-Registration Redirect

**Files:**
- Modify: `apps/web/app/(setup)/business-details/page.tsx` (line 147)

After successful registration, redirect users to `/dashboard` instead of `/checklist`.

- [ ] **Step 1: Update the redirect**

In `apps/web/app/(setup)/business-details/page.tsx`, find line 147:

```typescript
        router.push("/checklist");
```

Change to:

```typescript
        router.push("/dashboard");
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter @trustcrm/web type-check
```

Expected: no errors

- [ ] **Step 3: Final build verification**

```bash
pnpm --filter @trustcrm/web build
```

Expected: build completes successfully with no TypeScript or lint errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(setup\)/business-details/page.tsx
git commit -m "feat(web): redirect to /dashboard after registration instead of /checklist"
```
