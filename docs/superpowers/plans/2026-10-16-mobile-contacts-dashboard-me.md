# Mobile Plan 4: Contacts, Dashboard, Notifications and Me Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the launch (P1) mobile app: the Contacts tab (list, filters, add/edit contact), the Dashboard tab (overview, campaigns, templates), the Notifications screen and the Me tab — using only features that exist in the system today.

**Architecture:** Mobile only — no API changes. Pure, tested modules in `lib/` (formatting, status rules, notification routing) and thin Expo Router screens on TanStack Query. Each screen handles `403` by showing what the role may not see instead of an error. Realtime campaign events refresh campaign data. Reuses Plan 2/3 pieces: `useApi`, `useMe`, `Screen`, `OptionSheet`, theme, `queryKeysFor`.

**Tech Stack:** Expo SDK 57, Expo Router, TanStack Query v5, `@clerk/expo` v4, `expo-notifications`, Jest via `jest-expo`.

**Spec:** `docs/prd-mobile-app.md` (§4 navigation, §5 screens 8–13, §5a alignment table, §6 flows F5–F7). Mockups 3.1–3.4, 4.1–4.2: https://claude.ai/artifact/T1xZ5zPGscLw29TuFZ7ev2.

## Global Constraints

- Only existing features and web names (PRD §5a). Dashboard = the web dashboard v2: range **today / 7d / 30d**, **Needs attention**, KPIs **Messages (in/out), Open conversations, New conversations, New contacts, Campaigns sent, Avg time to first reply**, **Last campaign** funnel, **message usage** (admins / billing permission only), billing **standing banner**.
- Campaign actions: **Pause** (running), **Resume** (paused), **Abort** (running/paused, with confirmation), **Retry failed** (`requeue-failed`) — need `campaigns_pause_resume`; show the API's 403 as "You don't have permission to …".
- Templates list: status, category, language, quality, rejected reason; stats **Sent, Delivery rate, Read rate** from `GET /templates/stats`.
- Notifications: types `new_message`, `conversation_assigned`, `closure_overdue` only; "Mark all read".
- Me: **Online / Away**, **Notifications on this phone**, **Canned responses** (view), **Open web dashboard**, **Sign out**. Not shown (not system features): switch organization (a user belongs to one org), per-type notification settings, quiet hours, language, message sound (an org-wide web inbox setting).
- No API changes in this plan. Never the word "Plivo". Super admins never reach these screens (Plan 2 gate).
- Never run `pnpm dedupe` at the repo root; install mobile packages with `npx expo install` inside `apps/mobile` (none are expected).
- Commits end with a `Co-Authored-By:` trailer naming the model that wrote the commit.
- Mobile checks: `cd apps/mobile && pnpm jest <path>`, `pnpm tsc --noEmit`, `npx expo export --platform android --output-dir dist-check && rm -rf dist-check`.

## Review Focus

- An agent without `analytics_access` opens the Dashboard tab → a clear "The dashboard isn't available for your role" state, not an error loop. Test: Task 1 Step 1 (`isForbidden`), Task 2 Step 3 (403 branch).
- A campaign finishes while its detail screen is open → numbers update without pulling to refresh (realtime). Test: Task 3 Step 1 (`queryKeysFor("campaign:progress")`).
- An agent taps a notification row for a chat they can't see any more → the chat screen's "You don't have access" state (Plan 3), never a crash. Test: Task 5 Step 1 (`routeForNotificationAction`).
- Adding a contact with a phone number that already exists → "A contact with this phone number already exists." and the form keeps the input. Test: Task 1 Step 1 (`contactSaveError`).
- Away status set on the phone matches the web (same `availability` field) and the change survives an app restart. Test: Task 6 (PATCH then refetch `["gate", userId]`), manual device check.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/lib/dashboard.ts` (+ test) | Dashboard/billing types, number/duration/delta formatting, standing banner copy, attention route mapping, `isForbidden`, `contactSaveError` |
| `apps/mobile/lib/campaigns.ts` (+ test) | Campaign types, status labels/colours, available actions, progress maths |
| `apps/mobile/lib/notifications-feed.ts` (+ test) | Feed types, `routeForNotificationAction`, time labels |
| `apps/mobile/lib/realtime.ts` (+ test, modify) | Campaign events → `["campaigns"]` |
| `apps/mobile/components/SegmentedControl.tsx` | Small reusable segmented control (range, availability) |
| `apps/mobile/app/(app)/(tabs)/dashboard.tsx` | Dashboard overview |
| `apps/mobile/app/(app)/campaigns/index.tsx`, `campaigns/[id].tsx` | Campaign list + detail |
| `apps/mobile/app/(app)/templates/index.tsx` | Templates list |
| `apps/mobile/app/(app)/(tabs)/contacts.tsx` | Contacts list |
| `apps/mobile/app/(app)/contact/new.tsx` | Add contact |
| `apps/mobile/app/(app)/contact/[id]/index.tsx` (moved from `contact/[id].tsx`), `contact/[id]/edit.tsx` | Contact details (Plan 3) + edit name/email |
| `apps/mobile/app/(app)/notifications.tsx` | Notifications feed |
| `apps/mobile/app/(app)/(tabs)/me.tsx` | Me tab |
| `apps/mobile/app/(app)/canned-responses.tsx` | Read-only canned responses list |

---

### Task 1: Dashboard and contact helpers

**Files:**
- Create: `apps/mobile/lib/dashboard.ts`, `apps/mobile/lib/dashboard.test.ts`

**Interfaces:**
- Produces (used by Tasks 2, 4):

```ts
export type Range = "today" | "7d" | "30d";
export interface Kpi { value: number | null; previous: number | null; deltaPct: number | null }
export interface DashboardData {
  range: Range;
  attention: { key: string; severity: "critical" | "warning"; count: number; label: string; href: string }[];
  kpis: {
    openConversations: { value: number };
    newConversations: Kpi; newContacts: Kpi; firstReplySecs: Kpi; campaignsSent: Kpi;
    messages: Kpi & { inbound: number; outbound: number };
  } | null;
  campaignFunnel: { id: string; name: string; sentAt: string; sent: number; delivered: number; read: number; failed: number } | null;
}
export interface Standing { state: "ok" | "overdue" | "blocked" | "cancelled"; paused: boolean; dueAt: string | null; blockAt: string | null }
export function formatCount(n: number | null | undefined): string;
export function formatDuration(secs: number | null | undefined): string;
export function deltaText(k: Pick<Kpi, "deltaPct">, lowerIsBetter?: boolean): { text: string; tone: "good" | "bad" | "flat" } | null;
export function standingBanner(s: Standing | undefined): { title: string; body: string; tone: "warning" | "danger" } | null;
export function attentionRoute(href: string): string | null;
export function pct(part: number, whole: number): number;
export function isForbidden(err: unknown): boolean;
export function contactSaveError(err: unknown): string;
```

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/dashboard.test.ts
import { ApiError } from "./api";
import { attentionRoute, contactSaveError, deltaText, formatCount, formatDuration, isForbidden, pct, standingBanner } from "./dashboard";

describe("formatting", () => {
  it("formats counts with grouping and blanks", () => {
    expect(formatCount(1284)).toBe("1,284");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(null)).toBe("—");
  });
  it("formats seconds as m s / h m", () => {
    expect(formatDuration(220)).toBe("3m 40s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(3720)).toBe("1h 2m");
    expect(formatDuration(null)).toBe("—");
  });
  it("describes deltas, treating lower as better for reply time", () => {
    expect(deltaText({ deltaPct: 12 })).toEqual({ text: "▲ 12%", tone: "good" });
    expect(deltaText({ deltaPct: -8 })).toEqual({ text: "▼ 8%", tone: "bad" });
    expect(deltaText({ deltaPct: 20 }, true)).toEqual({ text: "▲ 20%", tone: "bad" });
    expect(deltaText({ deltaPct: 0 })).toEqual({ text: "No change", tone: "flat" });
    expect(deltaText({ deltaPct: null })).toBeNull();
  });
  it("computes whole percentages safely", () => {
    expect(pct(71, 100)).toBe(71);
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("standingBanner", () => {
  it("is empty when billing is fine or unknown", () => {
    expect(standingBanner(undefined)).toBeNull();
    expect(standingBanner({ state: "ok", paused: false, dueAt: null, blockAt: null })).toBeNull();
  });
  it("warns before sending pauses", () => {
    const b = standingBanner({ state: "overdue", paused: false, dueAt: "2026-10-14T00:00:00Z", blockAt: "2026-10-21T00:00:00Z" });
    expect(b?.tone).toBe("warning");
    expect(b?.title).toBe("Statement overdue");
    expect(b?.body).toMatch(/Sending will pause on/);
  });
  it("says sending is paused when blocked or cancelled", () => {
    expect(standingBanner({ state: "blocked", paused: true, dueAt: null, blockAt: null })?.title).toBe("Sending is paused");
    expect(standingBanner({ state: "cancelled", paused: true, dueAt: null, blockAt: null })?.title).toBe("This workspace is cancelled");
  });
});

describe("attentionRoute", () => {
  it("maps web links to app screens", () => {
    expect(attentionRoute("/inbox")).toBe("/inbox");
    expect(attentionRoute("/templates")).toBe("/templates");
    expect(attentionRoute("/messages")).toBeNull();
    expect(attentionRoute("/settings/whatsapp-account")).toBeNull();
  });
});

describe("errors", () => {
  it("recognises 403", () => {
    expect(isForbidden(new ApiError(403, "FORBIDDEN", "x"))).toBe(true);
    expect(isForbidden(new ApiError(500, "X", "x"))).toBe(false);
    expect(isForbidden(new Error("x"))).toBe(false);
  });
  it("explains contact save failures", () => {
    expect(contactSaveError(new ApiError(409, "DUPLICATE_PHONE", "x"))).toBe("A contact with this phone number already exists.");
    expect(contactSaveError(new ApiError(402, "PLAN_LIMIT_REACHED", "x"))).toBe("Your plan's contact limit is reached. An admin can change the plan on the web dashboard.");
    expect(contactSaveError(new ApiError(403, "FORBIDDEN", "x"))).toBe("You don't have permission to add or edit contacts.");
    expect(contactSaveError(new ApiError(400, "INVALID_PHONE", "Phone number is invalid"))).toBe("Phone number is invalid");
    expect(contactSaveError(new TypeError("Network request failed"))).toBe("Couldn't save. Check your connection and try again.");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `cd /e/Product/WhatsApp_CRM/apps/mobile && pnpm jest lib/dashboard.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/dashboard.ts
import { ApiError } from "./api";

export type Range = "today" | "7d" | "30d";
export interface Kpi { value: number | null; previous: number | null; deltaPct: number | null }
export interface DashboardData {
  range: Range;
  attention: { key: string; severity: "critical" | "warning"; count: number; label: string; href: string }[];
  kpis: {
    openConversations: { value: number };
    newConversations: Kpi;
    newContacts: Kpi;
    firstReplySecs: Kpi;
    campaignsSent: Kpi;
    messages: Kpi & { inbound: number; outbound: number };
  } | null;
  campaignFunnel: { id: string; name: string; sentAt: string; sent: number; delivered: number; read: number; failed: number } | null;
}
export interface Standing { state: "ok" | "overdue" | "blocked" | "cancelled"; paused: boolean; dueAt: string | null; blockAt: string | null }

export function formatCount(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("en-US");
}

export function formatDuration(secs: number | null | undefined): string {
  if (secs === null || secs === undefined) return "—";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

export function deltaText(k: Pick<Kpi, "deltaPct">, lowerIsBetter = false): { text: string; tone: "good" | "bad" | "flat" } | null {
  if (k.deltaPct === null) return null;
  if (k.deltaPct === 0) return { text: "No change", tone: "flat" };
  const up = k.deltaPct > 0;
  const good = lowerIsBetter ? !up : up;
  return { text: `${up ? "▲" : "▼"} ${Math.abs(Math.round(k.deltaPct))}%`, tone: good ? "good" : "bad" };
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "soon";
}

export function standingBanner(s: Standing | undefined): { title: string; body: string; tone: "warning" | "danger" } | null {
  if (!s || s.state === "ok") return null;
  if (s.state === "cancelled") return { title: "This workspace is cancelled", body: "Messages and campaigns can't be sent.", tone: "danger" };
  if (s.state === "blocked" || s.paused) {
    return { title: "Sending is paused", body: "A WBMSG statement is overdue, so messages and campaigns can't be sent. Customers can still message you. An admin can pay on the web dashboard.", tone: "danger" };
  }
  return { title: "Statement overdue", body: `Your WBMSG statement is overdue. Sending will pause on ${day(s.blockAt)} if it isn't paid.`, tone: "warning" };
}

/** Web dashboard links → mobile screens; null when the target only exists on the web. */
export function attentionRoute(href: string): string | null {
  if (href === "/inbox") return "/inbox";
  if (href === "/templates") return "/templates";
  return null;
}

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

export function contactSaveError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "DUPLICATE_PHONE") return "A contact with this phone number already exists.";
    if (err.code === "PLAN_LIMIT_REACHED") return "Your plan's contact limit is reached. An admin can change the plan on the web dashboard.";
    if (err.status === 403) return "You don't have permission to add or edit contacts.";
    if (err.status === 400 && err.message) return err.message;
  }
  return "Couldn't save. Check your connection and try again.";
}
```

- [ ] **Step 4: Run tests, type check** — `pnpm jest lib/dashboard.test.ts && pnpm tsc --noEmit` → pass; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/dashboard.ts apps/mobile/lib/dashboard.test.ts
git commit -m "feat(mobile): dashboard formatting, billing standing copy, attention links, contact save errors

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 2: Dashboard overview

**Files:**
- Create: `apps/mobile/components/SegmentedControl.tsx`
- Modify: `apps/mobile/app/(app)/(tabs)/dashboard.tsx` (replace placeholder)

**Interfaces:**
- Consumes: Task 1, `useApi`, `useMe`, `Screen`, theme. API: `GET /analytics/dashboard?range=&tz=` → `{ data: DashboardData }` (403 without `analytics_access`); `GET /billing/standing` → `{ data: Standing }` (any member); `GET /billing/message-usage` → `{ data: { billable: number; plan: { published: boolean; freeAllowance: number; current?: { name: string; inr: number | null; usd: number | null } } | null; cycle: { toExclusive: string } | null } }` (403 without `settings_billing` — hide the card).
- Produces: `SegmentedControl<T extends string>({ value, options: { value: T; label: string }[], onChange, accessibilityLabel })`; links to `/campaigns`, `/campaigns/[id]`, `/templates`, `/inbox`.

- [ ] **Step 1: SegmentedControl**

```tsx
// apps/mobile/components/SegmentedControl.tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius } from "../lib/theme";

export function SegmentedControl<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; accessibilityLabel: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={props.accessibilityLabel} style={styles.wrap}>
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => props.onChange(o.value)} style={[styles.item, on && styles.itemOn]}>
            <Text style={[styles.text, on && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: colors.border },
  item: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  itemOn: { backgroundColor: colors.surface },
  text: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  textOn: { color: colors.text },
});
```

- [ ] **Step 2: Dashboard screen**

```tsx
// apps/mobile/app/(app)/(tabs)/dashboard.tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Bell, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Screen } from "../../../components/Screen";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { useApi } from "../../../lib/api-context";
import { attentionRoute, deltaText, formatCount, formatDuration, isForbidden, pct, standingBanner, type DashboardData, type Range, type Standing } from "../../../lib/dashboard";
import { useMe } from "../../../lib/me-context";
import { colors, font, radius, space } from "../../../lib/theme";

interface Usage { billable: number; plan: { published: boolean; freeAllowance: number; current?: { name: string; inr: number | null; usd: number | null } } | null; cycle: { toExclusive: string } | null }

const TONE = { good: colors.brand, bad: colors.danger, flat: colors.textMuted } as const;

export default function DashboardScreen() {
  const api = useApi();
  const me = useMe();
  const router = useRouter();
  const [range, setRange] = useState<Range>("today");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const dash = useQuery({ queryKey: ["dashboard", range], queryFn: async () => (await api<{ data: DashboardData }>(`/analytics/dashboard?range=${range}&tz=${encodeURIComponent(tz)}`)).data, retry: (n, e) => !isForbidden(e) && n < 1 });
  const standing = useQuery({ queryKey: ["billing-standing"], queryFn: async () => (await api<{ data: Standing }>("/billing/standing")).data, staleTime: 5 * 60_000 });
  const usage = useQuery({ queryKey: ["billing-usage"], queryFn: async () => (await api<{ data: Usage }>("/billing/message-usage")).data, retry: false, staleTime: 5 * 60_000 });
  const banner = standingBanner(standing.data);
  const k = dash.data?.kpis ?? null;
  const funnel = dash.data?.campaignFunnel ?? null;

  return (
    <Screen>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.hello}>Hello, {me.fullName.split(" ")[0]}</Text>
          <Text style={styles.title} accessibilityRole="header">Dashboard</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Notifications" onPress={() => router.push("/notifications")} style={styles.icon}><Bell size={22} color={colors.text} /></Pressable>
      </View>
      <View style={styles.subnav}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/campaigns")} style={styles.sub}><Text style={styles.subText}>Campaigns</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/templates")} style={styles.sub}><Text style={styles.subText}>Templates</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={dash.isRefetching} onRefresh={() => { void dash.refetch(); void standing.refetch(); void usage.refetch(); }} tintColor={colors.brand} />}>
        {banner ? (
          <View style={[styles.banner, banner.tone === "danger" ? styles.bannerDanger : styles.bannerWarn]} accessibilityRole="alert">
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerBody}>{banner.body}</Text>
          </View>
        ) : null}

        <SegmentedControl accessibilityLabel="Range" value={range} onChange={setRange} options={[{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }]} />

        {dash.isLoading ? <ActivityIndicator color={colors.brand} /> : isForbidden(dash.error) ? (
          <View style={styles.card}><Text style={styles.muted}>The dashboard isn't available for your role.</Text></View>
        ) : dash.error && !dash.data ? (
          <View style={styles.card}>
            <Text style={styles.muted}>Couldn't load the dashboard.</Text>
            <Pressable accessibilityRole="button" onPress={() => void dash.refetch()} style={styles.retry}><Text style={styles.link}>Try again</Text></Pressable>
          </View>
        ) : (
          <>
            {(dash.data?.attention.length ?? 0) > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Needs attention</Text>
                {dash.data!.attention.map((a) => {
                  const to = attentionRoute(a.href);
                  return (
                    <Pressable key={a.key} accessibilityRole={to ? "button" : "text"} disabled={!to} onPress={() => to && router.push(to as never)} style={styles.attRow}>
                      <View style={[styles.dot, { backgroundColor: a.severity === "critical" ? colors.danger : "#D97706" }]} />
                      <Text style={styles.attLabel}>{a.label}</Text>
                      <Text style={styles.attCount}>{formatCount(a.count)}</Text>
                      {to ? <ChevronRight size={16} color={colors.textSubtle} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {k ? (
              <View style={styles.grid}>
                <View style={styles.kpi}><Text style={styles.kl}>Messages</Text><Text style={styles.kv}>{formatCount(k.messages.value)}</Text><Text style={styles.kd}>{formatCount(k.messages.inbound)} in / {formatCount(k.messages.outbound)} out</Text></View>
                <View style={styles.kpi}><Text style={styles.kl}>Open conversations</Text><Text style={styles.kv}>{formatCount(k.openConversations.value)}</Text><Text style={styles.kd}>right now</Text></View>
                {([["New conversations", k.newConversations, false], ["New contacts", k.newContacts, false], ["Campaigns sent", k.campaignsSent, false]] as const).map(([label, v, low]) => {
                  const d = deltaText(v, low);
                  return <View key={label} style={styles.kpi}><Text style={styles.kl}>{label}</Text><Text style={styles.kv}>{formatCount(v.value)}</Text>{d ? <Text style={[styles.kd, { color: TONE[d.tone] }]}>{d.text}</Text> : null}</View>;
                })}
                {(() => { const d = deltaText(k.firstReplySecs, true); return (
                  <View style={styles.kpi}><Text style={styles.kl}>Avg time to first reply</Text><Text style={styles.kv}>{formatDuration(k.firstReplySecs.value)}</Text>{d ? <Text style={[styles.kd, { color: TONE[d.tone] }]}>{d.text}</Text> : null}</View>
                ); })()}
              </View>
            ) : null}

            {funnel ? (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/campaigns/[id]", params: { id: funnel.id } })} style={styles.card}>
                <Text style={styles.cardTitle}>Last campaign</Text>
                <Text style={styles.campName}>{funnel.name}</Text>
                {([["Delivered", funnel.delivered, colors.brand], ["Read", funnel.read, "#2563EB"], ["Failed", funnel.failed, colors.danger]] as const).map(([label, n, c]) => (
                  <View key={label} style={styles.barRow}>
                    <Text style={styles.barLabel}>{label}</Text>
                    <View style={styles.bar}><View style={[styles.barFill, { width: `${pct(n, funnel.sent)}%`, backgroundColor: c }]} /></View>
                    <Text style={styles.barPct}>{pct(n, funnel.sent)}%</Text>
                  </View>
                ))}
              </Pressable>
            ) : null}
          </>
        )}

        {usage.data ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Message usage · this cycle</Text>
            <Text style={styles.big}>{formatCount(usage.data.billable)} <Text style={styles.muted}>billable messages</Text></Text>
            {usage.data.plan ? (
              <Text style={styles.muted}>
                Free {formatCount(usage.data.plan.freeAllowance)}
                {usage.data.plan.published && usage.data.plan.current ? ` · ${usage.data.plan.current.name}` : ""}
                {usage.data.cycle ? ` · cycle ends ${new Date(usage.data.cycle.toExclusive).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.xl, paddingTop: space.md },
  hello: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  title: { fontFamily: font.bold, fontSize: 28, color: colors.text },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  subnav: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  sub: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, justifyContent: "center" },
  subText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl, backgroundColor: colors.background },
  banner: { borderRadius: radius.lg, padding: space.lg, gap: 4, borderWidth: 1 },
  bannerWarn: { backgroundColor: colors.warningSoft, borderColor: "#FCD34D" },
  bannerDanger: { backgroundColor: colors.dangerSoft, borderColor: "#FCA5A5" },
  bannerTitle: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  bannerBody: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  cardTitle: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  attRow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  attLabel: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text },
  attCount: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  kpi: { width: "47%", flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: 2 },
  kl: { fontFamily: font.medium, fontSize: 12, color: colors.textMuted },
  kv: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  kd: { fontFamily: font.semibold, fontSize: 12, color: colors.textMuted },
  campName: { fontFamily: font.bold, fontSize: 16, color: colors.text },
  barRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  barLabel: { width: 70, fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  bar: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  barPct: { width: 40, textAlign: "right", fontFamily: font.bold, fontSize: 13, color: colors.text },
  big: { fontFamily: font.bold, fontSize: 24, color: colors.text },
  muted: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  retry: { minHeight: 44, justifyContent: "center" },
  link: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
});
```

Before writing, confirm the `GET /billing/message-usage` response field names against `apps/api/src/routes/billing-message-usage.ts` and `apps/web/lib/message-usage.ts` (`billable`, `plan.freeAllowance`, `plan.published`, `plan.current.name`, `cycle.toExclusive`); adapt only names that differ.

- [ ] **Step 3: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check` (routes `/campaigns` and `/templates` are created in Tasks 3–4; until then `router.push` to them may need `as never` — remove the casts in Task 4).

```bash
git add apps/mobile/components/SegmentedControl.tsx apps/mobile/app/\(app\)/\(tabs\)/dashboard.tsx
git commit -m "feat(mobile): Dashboard — range, needs attention, KPIs, last campaign, message usage, billing banner

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 3: Campaigns list and detail

**Files:**
- Create: `apps/mobile/lib/campaigns.ts`, `apps/mobile/lib/campaigns.test.ts`, `apps/mobile/app/(app)/campaigns/index.tsx`, `apps/mobile/app/(app)/campaigns/[id].tsx`
- Modify: `apps/mobile/lib/realtime.ts` + `realtime.test.ts` (campaign events)

**Interfaces:**
- Consumes: API `GET /campaigns` → `{ data: Campaign[] }` (each with `displayStatus`); `GET /campaigns/:id` → `{ data: Campaign }`; `GET /campaigns/:id/report` → `{ data: { stats: { sent, accepted, delivered, played, read, failed, pending, expired } } }`; `POST /campaigns/:id/pause|resume|abort|requeue-failed`. Socket events `campaign:progress`, `campaign:completed`, `campaign:aborted`, `campaign:expired` (payload `{ campaignId, … }`).
- Produces:

```ts
export type DisplayStatus = "draft" | "upcoming" | "scheduled" | "running" | "paused" | "completed" | "cancelled" | "aborted";
export interface Campaign { id: string; name: string; status: string; displayStatus: DisplayStatus; scheduledAt: string | null; sentAt: string | null; createdAt: string; isArchived: boolean }
export interface CampaignStats { sent: number; accepted: number; delivered: number; played: number; read: number; failed: number; pending: number; expired: number }
export function statusStyle(s: DisplayStatus): { label: string; bg: string; fg: string };
export function availableActions(s: DisplayStatus, stats: CampaignStats | null): ("pause" | "resume" | "abort" | "retry")[];
export function progress(stats: CampaignStats): { done: number; total: number; percent: number };
```

- [ ] **Step 1: Write the failing tests**

```ts
// apps/mobile/lib/campaigns.test.ts
import { availableActions, progress, statusStyle, type CampaignStats } from "./campaigns";

const stats = (p: Partial<CampaignStats>): CampaignStats => ({ sent: 0, accepted: 0, delivered: 0, played: 0, read: 0, failed: 0, pending: 0, expired: 0, ...p });

describe("statusStyle", () => {
  it("labels every display status", () => {
    expect(statusStyle("running").label).toBe("Running");
    expect(statusStyle("upcoming").label).toBe("Scheduled");
    expect(statusStyle("aborted").label).toBe("Aborted");
  });
});

describe("availableActions", () => {
  it("running → pause and abort; paused → resume and abort", () => {
    expect(availableActions("running", stats({}))).toEqual(["pause", "abort"]);
    expect(availableActions("paused", stats({}))).toEqual(["resume", "abort"]);
  });
  it("offers retry when messages failed and the campaign isn't aborted", () => {
    expect(availableActions("completed", stats({ failed: 3 }))).toEqual(["retry"]);
    expect(availableActions("running", stats({ failed: 1 }))).toEqual(["pause", "abort", "retry"]);
    expect(availableActions("aborted", stats({ failed: 2 }))).toEqual([]);
    expect(availableActions("completed", null)).toEqual([]);
  });
});

describe("progress", () => {
  it("counts every recipient that left pending", () => {
    expect(progress(stats({ sent: 10, delivered: 50, read: 20, failed: 5, pending: 15 }))).toEqual({ done: 85, total: 100, percent: 85 });
    expect(progress(stats({}))).toEqual({ done: 0, total: 0, percent: 0 });
  });
});
```

Add to `realtime.test.ts` in `describe("queryKeysFor")`:

```ts
  it("refreshes campaign data on campaign events", () => {
    for (const ev of ["campaign:progress", "campaign:completed", "campaign:aborted", "campaign:expired"]) {
      expect(queryKeysFor(ev, { campaignId: "k-1" })).toEqual([["campaigns"], ["dashboard"]]);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail** — `pnpm jest lib/campaigns.test.ts lib/realtime.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/campaigns.ts
export type DisplayStatus = "draft" | "upcoming" | "scheduled" | "running" | "paused" | "completed" | "cancelled" | "aborted";
export interface Campaign { id: string; name: string; status: string; displayStatus: DisplayStatus; scheduledAt: string | null; sentAt: string | null; createdAt: string; isArchived: boolean }
export interface CampaignStats { sent: number; accepted: number; delivered: number; played: number; read: number; failed: number; pending: number; expired: number }

const STYLE: Record<DisplayStatus, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: "#F3F4F6", fg: "#374151" },
  upcoming: { label: "Scheduled", bg: "#DBEAFE", fg: "#1E40AF" },
  scheduled: { label: "Scheduled", bg: "#DBEAFE", fg: "#1E40AF" },
  running: { label: "Running", bg: "#DCFCE7", fg: "#166534" },
  paused: { label: "Paused", bg: "#FEF3C7", fg: "#92400E" },
  completed: { label: "Completed", bg: "#F3F4F6", fg: "#374151" },
  cancelled: { label: "Cancelled", bg: "#F3F4F6", fg: "#374151" },
  aborted: { label: "Aborted", bg: "#FEE2E2", fg: "#991B1B" },
};

export function statusStyle(s: DisplayStatus): { label: string; bg: string; fg: string } {
  return STYLE[s] ?? STYLE.draft;
}

export function availableActions(s: DisplayStatus, stats: CampaignStats | null): ("pause" | "resume" | "abort" | "retry")[] {
  const out: ("pause" | "resume" | "abort" | "retry")[] = [];
  if (s === "running") out.push("pause", "abort");
  if (s === "paused") out.push("resume", "abort");
  if (stats && stats.failed > 0 && s !== "aborted" && s !== "cancelled") out.push("retry");
  return out;
}

export function progress(stats: CampaignStats): { done: number; total: number; percent: number } {
  const done = stats.sent + stats.accepted + stats.delivered + stats.played + stats.read + stats.failed + stats.expired;
  const total = done + stats.pending;
  return { done, total, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
}
```

In `apps/mobile/lib/realtime.ts` `queryKeysFor`, add before `default`:

```ts
    case "campaign:progress":
    case "campaign:completed":
    case "campaign:aborted":
    case "campaign:expired":
      return [["campaigns"], ["dashboard"]];
```

Run the tests → pass.

- [ ] **Step 4: Campaign list screen**

```tsx
// apps/mobile/app/(app)/campaigns/index.tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../lib/api-context";
import { statusStyle, type Campaign } from "../../../lib/campaigns";
import { isForbidden } from "../../../lib/dashboard";
import { colors, font, space } from "../../../lib/theme";

export default function CampaignsScreen() {
  const api = useApi();
  const router = useRouter();
  const list = useQuery({ queryKey: ["campaigns", "list"], queryFn: async () => (await api<{ data: Campaign[] }>("/campaigns")).data, retry: (n, e) => !isForbidden(e) && n < 1 });
  const items = (list.data ?? []).filter((c) => !c.isArchived);
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title} accessibilityRole="header">Campaigns</Text>
        <View style={styles.icon} />
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const st = statusStyle(item.displayStatus);
            const when = item.sentAt ?? item.scheduledAt ?? item.createdAt;
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/campaigns/[id]", params: { id: item.id } })} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.meta}>{new Date(when).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text>
                </View>
                <Text style={[styles.chip, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{isForbidden(list.error) ? "Campaigns aren't available for your role." : list.error ? "Couldn't load campaigns." : "No campaigns yet. Create them on the web dashboard."}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 64, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  chip: { fontFamily: font.semibold, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
```

- [ ] **Step 5: Campaign detail screen** (mockup 3.3; actions via `availableActions`, Abort confirmed with a 2-button Alert)

```tsx
// apps/mobile/app/(app)/campaigns/[id].tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../lib/api-context";
import { availableActions, progress, statusStyle, type Campaign, type CampaignStats } from "../../../lib/campaigns";
import { formatCount, isForbidden } from "../../../lib/dashboard";
import { colors, font, radius, space } from "../../../lib/theme";

const ACTION_LABEL = { pause: "Pause", resume: "Resume", abort: "Abort", retry: "Retry failed" } as const;
const ACTION_PATH = { pause: "pause", resume: "resume", abort: "abort", retry: "requeue-failed" } as const;

export default function CampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const campaign = useQuery({ queryKey: ["campaigns", "detail", id], queryFn: async () => (await api<{ data: Campaign }>(`/campaigns/${id}`)).data });
  const report = useQuery({ queryKey: ["campaigns", "report", id], queryFn: async () => (await api<{ data: { stats: CampaignStats } }>(`/campaigns/${id}/report`)).data.stats });

  const act = useMutation({
    mutationFn: (a: keyof typeof ACTION_PATH) => api(`/campaigns/${id}/${ACTION_PATH[a]}`, { method: "POST" }),
    onMutate: () => setError(null),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaigns"] }),
    onError: (e) => setError(isForbidden(e) ? "You don't have permission to pause, resume or abort campaigns." : "Couldn't update the campaign. Try again."),
  });

  function run(a: keyof typeof ACTION_PATH) {
    if (a !== "abort") return act.mutate(a);
    Alert.alert("Abort this campaign?", "Contacts who haven't been messaged yet won't be. This can't be undone.", [
      { text: "Keep sending", style: "cancel" },
      { text: "Abort", style: "destructive", onPress: () => act.mutate("abort") },
    ]);
  }

  if (campaign.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!campaign.data) {
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.stateTitle}>{isForbidden(campaign.error) ? "Campaigns aren't available for your role" : "Couldn't load this campaign"}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.primary}><Text style={styles.primaryText}>Back</Text></Pressable>
      </SafeAreaView>
    );
  }
  const c = campaign.data;
  const st = statusStyle(c.displayStatus);
  const s = report.data ?? null;
  const p = s ? progress(s) : null;
  const actions = availableActions(c.displayStatus, s);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.headTitle} accessibilityRole="header">Campaign</Text>
        <View style={styles.icon} />
      </View>
      <ScrollView contentContainerStyle={styles.body} refreshControl={<RefreshControl refreshing={report.isRefetching} onRefresh={() => { void campaign.refetch(); void report.refetch(); }} tintColor={colors.brand} />}>
        <Text style={[styles.chip, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
        <Text style={styles.name}>{c.name}</Text>
        {p ? (
          <View style={styles.card}>
            <View style={styles.line}><Text style={styles.strong}>{formatCount(p.done)} of {formatCount(p.total)} processed</Text><Text style={styles.muted}>{p.percent}%</Text></View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: p.percent }} style={styles.bar}><View style={[styles.barFill, { width: `${p.percent}%` }]} /></View>
          </View>
        ) : null}
        {s ? (
          <View style={[styles.card, styles.grid]}>
            {([["Sent", s.sent + s.accepted], ["Delivered", s.delivered + s.played], ["Read", s.read], ["Failed", s.failed], ["Pending", s.pending], ["Expired", s.expired]] as const).map(([label, n]) => (
              <View key={label} style={styles.stat}><Text style={styles.muted}>{label}</Text><Text style={[styles.statValue, label === "Failed" && n > 0 ? { color: colors.danger } : null]}>{formatCount(n)}</Text></View>
            ))}
          </View>
        ) : report.isLoading ? <ActivityIndicator color={colors.brand} /> : null}
        <Text style={styles.note}>Create or edit campaigns on the web dashboard.</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      </ScrollView>
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable key={a} accessibilityRole="button" accessibilityState={{ busy: act.isPending, disabled: act.isPending }} disabled={act.isPending} onPress={() => run(a)} style={[styles.action, a === "abort" ? styles.danger : null]}>
              <Text style={[styles.actionText, a === "abort" ? { color: "#FFFFFF" } : null]}>{ACTION_LABEL[a]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  body: { padding: space.lg, gap: space.md },
  chip: { alignSelf: "flex-start", fontFamily: font.semibold, fontSize: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  name: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  line: { flexDirection: "row", justifyContent: "space-between" },
  strong: { fontFamily: font.semibold, fontSize: 14, color: colors.text },
  muted: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  bar: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.brand },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "33%", paddingVertical: space.sm },
  statValue: { fontFamily: font.bold, fontSize: 20, color: colors.text },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, textAlign: "center" },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
  actions: { flexDirection: "row", gap: space.md, padding: space.lg, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  action: { flex: 1, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  actionText: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl, backgroundColor: colors.surface },
  stateTitle: { fontFamily: font.bold, fontSize: 18, color: colors.text, textAlign: "center" },
  primary: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
```

Confirm `GET /campaigns/:id` returns `{ data }` with `displayStatus` (`apps/api/src/routes/campaigns.ts:71`); if it returns the raw campaign without `displayStatus`, compute it on the client with the same rule as the API (`aborted` → aborted; `scheduled` with a future `scheduledAt` → upcoming; else `status`) — add that as `displayStatusOf(c)` in `lib/campaigns.ts` with a test.

- [ ] **Step 6: Verify and commit**

Run: `pnpm jest && pnpm tsc --noEmit && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`

```bash
git add apps/mobile/lib apps/mobile/app/\(app\)/campaigns
git commit -m "feat(mobile): campaigns list and detail with live progress, pause/resume/abort and retry failed

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 4: Templates list

**Files:**
- Create: `apps/mobile/app/(app)/templates/index.tsx`
- Modify: `apps/mobile/app/(app)/(tabs)/dashboard.tsx` (remove any `as never` added in Task 2 for `/campaigns` and `/templates`)

**Interfaces:**
- Consumes: `GET /templates` → `{ data: { id, name, category, language, status, qualityScore, rejectedReason }[] }`; `GET /templates/stats?range=30d` → `{ data: { templateId, sent, delivered, read, deliveryRate, readRate }[] }` (403 without `templates_access`).

- [ ] **Step 1: Screen** (mockup 3.4: filter chips All / Approved / Pending / Rejected, stats for approved templates)

```tsx
// apps/mobile/app/(app)/templates/index.tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../lib/api-context";
import { formatCount, isForbidden } from "../../../lib/dashboard";
import { colors, font, radius, space } from "../../../lib/theme";

interface Template { id: string; name: string; category: string; language: string; status: string; qualityScore: string | null; rejectedReason: string | null }
interface Stat { templateId: string; sent: number; deliveryRate: number | null; readRate: number | null }
type Filter = "all" | "approved" | "pending" | "rejected";
const STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  approved: { label: "Approved", bg: "#DCFCE7", fg: "#166534" },
  pending: { label: "Pending", bg: "#FEF3C7", fg: "#92400E" },
  rejected: { label: "Rejected", bg: "#FEE2E2", fg: "#991B1B" },
  paused: { label: "Paused", bg: "#F3F4F6", fg: "#374151" },
  disabled: { label: "Disabled", bg: "#F3F4F6", fg: "#374151" },
};

export default function TemplatesScreen() {
  const api = useApi();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const list = useQuery({ queryKey: ["templates"], queryFn: () => api<{ data: Template[] }>("/templates"), retry: (n, e) => !isForbidden(e) && n < 1 });
  const stats = useQuery({ queryKey: ["templates", "stats", "30d"], queryFn: () => api<{ data: Stat[] }>("/templates/stats?range=30d"), retry: false });
  const byId = useMemo(() => new Map((stats.data?.data ?? []).map((s) => [s.templateId, s])), [stats.data]);
  const items = (list.data?.data ?? []).filter((t) => filter === "all" || t.status === filter);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title} accessibilityRole="header">Templates</Text>
        <View style={styles.icon} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        {(["all", "approved", "pending", "rejected"] as const).map((f) => (
          <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: filter === f }} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f && styles.chipTextOn]}>{f === "all" ? "All" : STATUS[f]!.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: space.lg, gap: space.md }}
          renderItem={({ item }) => {
            const st = STATUS[item.status] ?? { label: item.status, bg: "#F3F4F6", fg: "#374151" };
            const s = byId.get(item.id);
            return (
              <View style={styles.card}>
                <View style={styles.line}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.status, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
                </View>
                <Text style={styles.meta}>{item.category} · {item.language}{item.qualityScore ? ` · Quality: ${item.qualityScore}` : ""}</Text>
                {item.status === "rejected" && item.rejectedReason ? (
                  <View style={styles.reject}><Text style={styles.rejectText}>Rejected reason: {item.rejectedReason}. Edit and resubmit on the web dashboard.</Text></View>
                ) : null}
                {item.status === "approved" && s ? (
                  <View style={styles.stats}>
                    <View style={styles.stat}><Text style={styles.statLabel}>Sent (30 days)</Text><Text style={styles.statValue}>{formatCount(s.sent)}</Text></View>
                    <View style={styles.stat}><Text style={styles.statLabel}>Delivery rate</Text><Text style={styles.statValue}>{s.deliveryRate === null ? "—" : `${Math.round(s.deliveryRate)}%`}</Text></View>
                    <View style={styles.stat}><Text style={styles.statLabel}>Read rate</Text><Text style={styles.statValue}>{s.readRate === null ? "—" : `${Math.round(s.readRate)}%`}</Text></View>
                  </View>
                ) : null}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{isForbidden(list.error) ? "Templates aren't available for your role." : list.error ? "Couldn't load templates." : "No templates here."}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  chip: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, justifyContent: "center" },
  chipOn: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  chipTextOn: { color: "#FFFFFF" },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { flex: 1, fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 14, color: colors.text },
  status: { fontFamily: font.semibold, fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  reject: { backgroundColor: "#FEF2F2", borderRadius: radius.sm, padding: space.md },
  rejectText: { fontFamily: font.regular, fontSize: 13, lineHeight: 19, color: "#7F1D1D" },
  stats: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F3F4F6", paddingTop: space.sm },
  stat: { flex: 1 },
  statLabel: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
  statValue: { fontFamily: font.bold, fontSize: 15, color: colors.text },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
```

Confirm in `apps/api/src/lib/template-analytics.ts` whether `deliveryRate`/`readRate` are 0–100 or 0–1; if 0–1, multiply by 100 before rounding.

- [ ] **Step 2: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`

```bash
git add apps/mobile/app/\(app\)/templates apps/mobile/app/\(app\)/\(tabs\)/dashboard.tsx
git commit -m "feat(mobile): templates list with status, quality, rejected reason and 30-day stats

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 5: Contacts tab, add and edit contact

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/contacts.tsx` (replace placeholder)
- Move: `apps/mobile/app/(app)/contact/[id].tsx` → `apps/mobile/app/(app)/contact/[id]/index.tsx` (`git mv`; fix relative imports one level deeper; add an **Edit** button in its header that pushes `/contact/[id]/edit`)
- Create: `apps/mobile/app/(app)/contact/new.tsx`, `apps/mobile/app/(app)/contact/[id]/edit.tsx`

**Interfaces:**
- Consumes: Task 1 (`contactSaveError`, `isForbidden`), `OptionSheet` (Plan 3: `components/OptionSheet.tsx` — read its props before use). API: `GET /contacts?q=&tag=&groupId=&cursor=&limit=50` → `{ data: { id, firstName, lastName, name, phoneNumber, tags, leadStatus: { name, color } | null }[], pagination: { next_cursor: string | null, has_more: boolean } }`; `GET /contacts/tags` → `{ data: string[] }`; `GET /contact-groups` → `{ data: { id, title }[] }`; `POST /contacts { phoneNumber, firstName?, lastName?, email? }` → `201 { data: { id } }` (409 `DUPLICATE_PHONE`, 402 `PLAN_LIMIT_REACHED`, 403); `PATCH /contacts/:id { firstName?, lastName?, email? }`.

- [ ] **Step 1: Contacts list** (mockup 3.1: search, All tags / All groups, rows → `/contact/[id]`, add button)

```tsx
// apps/mobile/app/(app)/(tabs)/contacts.tsx
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronDown, Plus, Search } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { OptionSheet } from "../../../components/OptionSheet";
import { Screen } from "../../../components/Screen";
import { useApi } from "../../../lib/api-context";
import { isForbidden } from "../../../lib/dashboard";
import { colors, font, radius, space } from "../../../lib/theme";

interface Row { id: string; firstName: string | null; lastName: string | null; name: string | null; phoneNumber: string; tags: string[]; leadStatus: { name: string; color: string } | null }
interface Page { data: Row[]; pagination: { next_cursor: string | null; has_more: boolean } }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

export default function ContactsScreen() {
  const api = useApi();
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim(), 300);
  const [tag, setTag] = useState<string | null>(null);
  const [group, setGroup] = useState<{ id: string; title: string } | null>(null);
  const [sheet, setSheet] = useState<"tag" | "group" | null>(null);

  const list = useInfiniteQuery({
    queryKey: ["contacts", "list", query, tag, group?.id ?? null],
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams({ limit: "50" });
      if (query) p.set("q", query);
      if (tag) p.set("tag", tag);
      if (group) p.set("groupId", group.id);
      if (pageParam) p.set("cursor", pageParam);
      return api<Page>(`/contacts?${p.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.pagination.has_more ? last.pagination.next_cursor : undefined),
    retry: (n, e) => !isForbidden(e) && n < 1,
  });
  const tags = useQuery({ queryKey: ["contacts", "tags"], queryFn: () => api<{ data: string[] }>("/contacts/tags"), enabled: sheet === "tag" });
  const groups = useQuery({ queryKey: ["contact-groups"], queryFn: () => api<{ data: { id: string; title: string }[] }>("/contact-groups"), enabled: sheet === "group", retry: false });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Screen>
      <View style={styles.header}><Text style={styles.title} accessibilityRole="header">Contacts</Text></View>
      <View style={styles.search}>
        <Search size={18} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search name, phone or email" accessibilityLabel="Search contacts" style={styles.input} autoCorrect={false} />
      </View>
      <View style={styles.filters}>
        <Pressable accessibilityRole="button" accessibilityLabel={tag ? `Tag ${tag}, change` : "Filter by tag"} onPress={() => setSheet("tag")} style={[styles.filter, tag ? styles.filterOn : null]}>
          <Text style={[styles.filterText, tag ? styles.filterTextOn : null]}>{tag ?? "All tags"}</Text><ChevronDown size={14} color={tag ? "#FFFFFF" : colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={group ? `Group ${group.title}, change` : "Filter by group"} onPress={() => setSheet("group")} style={[styles.filter, group ? styles.filterOn : null]}>
          <Text style={[styles.filterText, group ? styles.filterTextOn : null]}>{group?.title ?? "All groups"}</Text><ChevronDown size={14} color={group ? "#FFFFFF" : colors.text} />
        </Pressable>
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.brand} style={{ marginTop: space.xl }} /> : (
        <FlatList
          data={rows}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          onEndReached={() => { if (list.hasNextPage && !list.isFetchingNextPage && !list.isFetchNextPageError) void list.fetchNextPage(); }}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const name = [item.firstName, item.lastName].filter(Boolean).join(" ") || item.name || item.phoneNumber;
            return (
              <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/contact/[id]", params: { id: item.id } })} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={1}>{name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>{item.phoneNumber}{item.tags.length ? ` · ${item.tags.join(", ")}` : ""}</Text>
                </View>
                {item.leadStatus ? <Text style={styles.lead}>{item.leadStatus.name}</Text> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{isForbidden(list.error) ? "Contacts aren't available for your role." : list.error ? "Couldn't load contacts." : "No contacts found."}</Text>}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator color={colors.brand} /> : <View style={{ height: 96 }} />}
        />
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="New contact" onPress={() => router.push("/contact/new")} style={styles.fab}><Plus size={24} color="#FFFFFF" /></Pressable>
      <OptionSheet
        visible={sheet === "tag"}
        title="Filter by tag"
        options={[{ label: "All tags", value: "" }, ...(tags.data?.data ?? []).map((t) => ({ label: t, value: t }))]}
        onSelect={(v) => setTag(v || null)}
        onClose={() => setSheet(null)}
      />
      <OptionSheet
        visible={sheet === "group"}
        title="Filter by group"
        options={[{ label: "All groups", value: "" }, ...(groups.data?.data ?? []).map((g) => ({ label: g.title, value: g.id }))]}
        onSelect={(v) => setGroup(v ? (groups.data?.data ?? []).find((g) => g.id === v) ?? null : null)}
        onClose={() => setSheet(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.xl, paddingTop: space.md },
  title: { fontFamily: font.bold, fontSize: 28, color: colors.text },
  search: { flexDirection: "row", alignItems: "center", gap: space.sm, marginHorizontal: space.lg, marginTop: space.sm, height: 44, borderRadius: radius.md, backgroundColor: colors.background, paddingHorizontal: space.md },
  input: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text },
  filters: { flexDirection: "row", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  filter: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  filterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  filterTextOn: { color: "#FFFFFF" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 60, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  name: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  meta: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  lead: { fontFamily: font.semibold, fontSize: 12, color: colors.text, backgroundColor: colors.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: "hidden" },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  fab: { position: "absolute", right: space.xl, bottom: space.xl, width: 56, height: 56, borderRadius: 18, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", elevation: 4 },
});
```

Adapt the two `OptionSheet` calls to its real props (read `apps/mobile/components/OptionSheet.tsx` first — option shape, `visible`/`onClose`/`onSelect` names). Confirm the `/contacts` list response key `pagination.next_cursor` / `has_more` (`apps/api/src/lib/pagination.ts`).

- [ ] **Step 2: Add contact**

```tsx
// apps/mobile/app/(app)/contact/new.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../lib/api-context";
import { contactSaveError } from "../../../lib/dashboard";
import { colors, font, radius, space } from "../../../lib/theme";

export default function NewContactScreen() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => api<{ data: { id: string } }>("/contacts", {
      method: "POST",
      body: {
        phoneNumber: form.phoneNumber.trim(),
        ...(form.firstName.trim() ? { firstName: form.firstName.trim() } : {}),
        ...(form.lastName.trim() ? { lastName: form.lastName.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      },
    }),
    onMutate: () => setError(null),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ["contacts"] }); router.replace({ pathname: "/contact/[id]", params: { id: r.data.id } }); },
    onError: (e) => setError(contactSaveError(e)),
  });
  const canSave = form.phoneNumber.trim().length >= 6 && !save.isPending;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.side}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title} accessibilityRole="header">New contact</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave, busy: save.isPending }} disabled={!canSave} onPress={() => save.mutate()} style={styles.side}>
          {save.isPending ? <ActivityIndicator color={colors.brand} /> : <Text style={[styles.save, !canSave && { opacity: 0.4 }]}>Save</Text>}
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {([["firstName", "First name", "default"], ["lastName", "Last name", "default"], ["phoneNumber", "WhatsApp number (with country code)", "phone-pad"], ["email", "Email", "email-address"]] as const).map(([k, label, kb]) => (
            <View key={k} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput value={form[k]} onChangeText={set(k)} accessibilityLabel={label} keyboardType={kb} autoCapitalize={k === "email" ? "none" : "words"} placeholder={k === "phoneNumber" ? "+44 7700 900123" : undefined} style={styles.input} />
            </View>
          ))}
          <Text style={styles.hint}>Groups, tags and custom fields can be added on the contact after saving, or on the web dashboard.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm },
  side: { minWidth: 72, minHeight: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  cancel: { fontFamily: font.regular, fontSize: 15, color: colors.text },
  save: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  body: { padding: space.lg, gap: space.lg },
  field: { gap: 6 },
  label: { fontFamily: font.medium, fontSize: 14, color: colors.text },
  input: { height: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 16, color: colors.text },
  hint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
});
```

Confirm `POST /contacts` returns `201 { data: { id, … } }` and what phone formats `normalizeFullPhone` accepts (`apps/api/src/lib/phone-normalize.ts`) — if it requires digits only, strip spaces before sending.

- [ ] **Step 3: Edit name and email**

```tsx
// apps/mobile/app/(app)/contact/[id]/edit.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../../lib/api-context";
import { contactSaveError } from "../../../../lib/dashboard";
import { colors, font, radius, space } from "../../../../lib/theme";

export default function EditContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const contact = useQuery({ queryKey: ["contacts", "detail", id], queryFn: async () => (await api<{ data: { firstName: string | null; lastName: string | null; email: string | null } }>(`/contacts/${id}`)).data });
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (contact.data) setForm({ firstName: contact.data.firstName ?? "", lastName: contact.data.lastName ?? "", email: contact.data.email ?? "" }); }, [contact.data]);
  const save = useMutation({
    mutationFn: () => api(`/contacts/${id}`, { method: "PATCH", body: { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim() } }),
    onMutate: () => setError(null),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["contacts"] }); void qc.invalidateQueries({ queryKey: ["conversations"] }); router.back(); },
    onError: (e) => setError(contactSaveError(e)),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.side}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title} accessibilityRole="header">Edit contact</Text>
        <Pressable accessibilityRole="button" disabled={save.isPending || !contact.data} onPress={() => save.mutate()} style={styles.side}>
          {save.isPending ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.save}>Save</Text>}
        </Pressable>
      </View>
      {contact.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <View style={styles.body}>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {([["firstName", "First name"], ["lastName", "Last name"], ["email", "Email"]] as const).map(([k, label]) => (
            <View key={k} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput value={form[k]} onChangeText={(v) => setForm((f) => ({ ...f, [k]: v }))} accessibilityLabel={label} keyboardType={k === "email" ? "email-address" : "default"} autoCapitalize={k === "email" ? "none" : "words"} style={styles.input} />
            </View>
          ))}
          <Text style={styles.hint}>The phone number can't be changed here.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm },
  side: { minWidth: 72, minHeight: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  cancel: { fontFamily: font.regular, fontSize: 15, color: colors.text },
  save: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  body: { padding: space.lg, gap: space.lg },
  field: { gap: 6 },
  label: { fontFamily: font.medium, fontSize: 14, color: colors.text },
  input: { height: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 16, color: colors.text },
  hint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
});
```

In the moved `contact/[id]/index.tsx`, replace the empty right-hand header `View` with an **Edit** button: `<Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/contact/[id]/edit", params: { id } })} style={styles.icon}><Text style={{ fontFamily: font.semibold, fontSize: 15, color: colors.brand }}>Edit</Text></Pressable>`. Confirm that `PATCH /contacts/:id` with `email: ""` clears the email rather than failing validation; if it fails, send `email` only when non-empty.

- [ ] **Step 4: Verify and commit**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check` (export must list `/contact/new`, `/contact/[id]`, `/contact/[id]/edit`).

```bash
git add -A apps/mobile/app/\(app\)/contact apps/mobile/app/\(app\)/\(tabs\)/contacts.tsx
git commit -m "feat(mobile): Contacts tab with search, tag and group filters; add and edit contact

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 6: Notifications screen and Me tab

**Files:**
- Create: `apps/mobile/lib/notifications-feed.ts`, `apps/mobile/lib/notifications-feed.test.ts`, `apps/mobile/app/(app)/canned-responses.tsx`
- Modify: `apps/mobile/app/(app)/notifications.tsx` (replace placeholder), `apps/mobile/app/(app)/(tabs)/me.tsx`

**Interfaces:**
- Consumes: `GET /notifications` → `{ data: { id, type, message, action, readAt, createdAt }[], unreadCount }`; `PUT /notifications/read-all`; `PATCH /users/me/availability { availability: "online" | "away" }`; `GET /organizations/me` → `{ data: { name } }`; `GET /canned-responses`; Plan 2 `lib/push.ts` (`getPushToken`, `registerDevice`, `signOutAndUnregister`), `expo-notifications` permissions, `useMe()`, gate query key `["gate", userId]`.
- Produces: `routeForNotificationAction(type: string, action: string | null): string | null`; `relativeTime(iso: string, now: number): string`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/notifications-feed.test.ts
import { relativeTime, routeForNotificationAction } from "./notifications-feed";

describe("routeForNotificationAction", () => {
  it("opens the chat for message and assignment notifications", () => {
    expect(routeForNotificationAction("new_message", "/inbox?conversation=c-1")).toBe("/conversation/c-1");
    expect(routeForNotificationAction("conversation_assigned", "/inbox?conversation=c-2")).toBe("/conversation/c-2");
  });
  it("opens the contacts tab for lead closure reminders", () => {
    expect(routeForNotificationAction("closure_overdue", null)).toBe("/contacts");
  });
  it("ignores anything it can't map", () => {
    expect(routeForNotificationAction("new_message", null)).toBeNull();
    expect(routeForNotificationAction("new_message", "/inbox")).toBeNull();
    expect(routeForNotificationAction("other", "/inbox?conversation=c-1")).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  it("shows minutes, hours and days", () => {
    expect(relativeTime("2026-10-16T11:59:40Z", now)).toBe("now");
    expect(relativeTime("2026-10-16T11:54:00Z", now)).toBe("6m");
    expect(relativeTime("2026-10-16T09:00:00Z", now)).toBe("3h");
    expect(relativeTime("2026-10-14T12:00:00Z", now)).toBe("2d");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm jest lib/notifications-feed.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/notifications-feed.ts
export interface FeedItem { id: string; type: string; message: string | null; action: string | null; readAt: string | null; createdAt: string }

/** The API stores web paths in `action` (e.g. /inbox?conversation=<id>); map them to app routes. */
export function routeForNotificationAction(type: string, action: string | null): string | null {
  if (type === "new_message" || type === "conversation_assigned") {
    const m = action ? /[?&]conversation=([^&]+)/.exec(action) : null;
    return m?.[1] ? `/conversation/${decodeURIComponent(m[1])}` : null;
  }
  if (type === "closure_overdue") return "/contacts";
  return null;
}

export function relativeTime(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}
```

Run → pass.

- [ ] **Step 4: Notifications screen** (mockup 4.1)

```tsx
// apps/mobile/app/(app)/notifications.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Clock, MessageSquare, UserPlus, ChevronLeft } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../lib/api-context";
import { relativeTime, routeForNotificationAction, type FeedItem } from "../../lib/notifications-feed";
import { colors, font, space } from "../../lib/theme";

const ICON = { new_message: MessageSquare, conversation_assigned: UserPlus, closure_overdue: Clock } as const;

export default function NotificationsScreen() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const feed = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ data: FeedItem[]; unreadCount: number }>("/notifications") });
  const readAll = useMutation({ mutationFn: () => api("/notifications/read-all", { method: "PUT" }), onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }) });
  const now = Date.now();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title} accessibilityRole="header">Notifications</Text>
        <Pressable accessibilityRole="button" disabled={readAll.isPending || !feed.data?.unreadCount} onPress={() => readAll.mutate()} style={styles.readAll}>
          <Text style={[styles.readAllText, !feed.data?.unreadCount && { opacity: 0.4 }]}>Mark all read</Text>
        </Pressable>
      </View>
      {feed.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={feed.data?.data ?? []}
          keyExtractor={(n) => n.id}
          refreshControl={<RefreshControl refreshing={feed.isRefetching} onRefresh={() => void feed.refetch()} tintColor={colors.brand} />}
          renderItem={({ item }) => {
            const to = routeForNotificationAction(item.type, item.action);
            const Icon = ICON[item.type as keyof typeof ICON] ?? MessageSquare;
            const unread = item.readAt === null;
            return (
              <Pressable accessibilityRole={to ? "button" : "text"} disabled={!to} onPress={() => to && router.push(to as never)} style={[styles.row, unread && styles.unread]}>
                <View style={styles.badge}><Icon size={20} color={colors.brandDark} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.msg, unread && styles.msgUnread]}>{item.message ?? "Notification"}</Text>
                  <Text style={styles.time}>{relativeTime(item.createdAt, now)}</Text>
                </View>
                {unread ? <View accessibilityLabel="Unread" style={styles.dot} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{feed.error ? "Couldn't load notifications." : "You're all caught up."}</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontFamily: font.bold, fontSize: 18, color: colors.text },
  readAll: { minHeight: 44, justifyContent: "center", paddingHorizontal: space.md },
  readAllText: { fontFamily: font.semibold, fontSize: 14, color: colors.brand },
  row: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 64 },
  unread: { backgroundColor: "#F0FDF4" },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center" },
  msg: { fontFamily: font.regular, fontSize: 15, color: colors.text },
  msgUnread: { fontFamily: font.semibold },
  time: { fontFamily: font.regular, fontSize: 12, color: colors.textSubtle, marginTop: 2 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand, marginTop: 6 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
```

- [ ] **Step 5: Canned responses (read-only)**

```tsx
// apps/mobile/app/(app)/canned-responses.tsx
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../lib/api-context";
import { colors, font, space } from "../../lib/theme";

interface Canned { id: string; name: string; shortcut: string | null; content: string; category: string }

export default function CannedResponsesScreen() {
  const api = useApi();
  const router = useRouter();
  const list = useQuery({ queryKey: ["canned-responses"], queryFn: () => api<{ data: Canned[] }>("/canned-responses") });
  const items = (list.data?.data ?? []).filter((c) => c.category === "general");
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.title} accessibilityRole="header">Canned responses</Text>
        <View style={styles.icon} />
      </View>
      {list.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.name}>{item.name}{item.shortcut ? `  /${item.shortcut}` : ""}</Text>
              <Text style={styles.content}>{item.content}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{list.error ? "Couldn't load canned responses." : "No canned responses yet."}</Text>}
          ListFooterComponent={<Text style={styles.note}>Add or edit canned responses on the web dashboard. Use them in a chat from the + menu.</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  item: { paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  name: { fontFamily: font.semibold, fontSize: 15, color: colors.text },
  content: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, marginTop: 2 },
  empty: { fontFamily: font.regular, fontSize: 15, color: colors.textMuted, textAlign: "center", padding: space.xl },
  note: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted, textAlign: "center", padding: space.xl },
});
```

- [ ] **Step 6: Me tab** (mockup 4.2, aligned)

Replace `apps/mobile/app/(app)/(tabs)/me.tsx` body, keeping its existing guarded Sign out button and logic (read the current file first):

```tsx
// Additions to apps/mobile/app/(app)/(tabs)/me.tsx — keep the existing sign-out button/handler.
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AppState, Linking } from "react-native";
import { SegmentedControl } from "../../../components/SegmentedControl";
import { config } from "../../../lib/config";
import { registerDevice } from "../../../lib/push";

// inside MeScreen():
const { userId } = useAuth();
const qc = useQueryClient();
const router = useRouter();
const org = useQuery({ queryKey: ["organization"], queryFn: async () => (await api<{ data: { name: string } }>("/organizations/me")).data, staleTime: 10 * 60_000 });
const [availability, setAvailability] = useState<"online" | "away">(me.availability === "away" ? "away" : "online");
const [availError, setAvailError] = useState<string | null>(null);
const saveAvailability = useMutation({
  mutationFn: (a: "online" | "away") => api("/users/me/availability", { method: "PATCH", body: { availability: a } }),
  onMutate: (a) => { setAvailError(null); setAvailability(a); },
  onSuccess: () => void qc.invalidateQueries({ queryKey: ["gate", userId] }),
  onError: () => { setAvailability(me.availability === "away" ? "away" : "online"); setAvailError("Couldn't update your status. Try again."); },
});
const [pushStatus, setPushStatus] = useState<string>("undetermined");
useEffect(() => {
  const read = () => void Notifications.getPermissionsAsync().then((p) => setPushStatus(p.status));
  read();
  const sub = AppState.addEventListener("change", (s) => { if (s === "active") read(); });
  return () => sub.remove();
}, []);
async function onPushRow() {
  if (pushStatus === "granted") return;
  if (pushStatus === "denied") return void Linking.openSettings();
  await registerDevice(api).catch(() => null);
  const p = await Notifications.getPermissionsAsync();
  setPushStatus(p.status);
}
```

and render (above the existing Sign out button):

```tsx
      <Text style={styles.sub}>{me.email}{org.data ? ` · ${org.data.name}` : ""}</Text>

      <Text style={styles.sec}>AVAILABILITY</Text>
      <View style={{ paddingHorizontal: space.xl }}>
        <SegmentedControl accessibilityLabel="Availability" value={availability} onChange={(a) => saveAvailability.mutate(a)} options={[{ value: "online", label: "Online" }, { value: "away", label: "Away" }]} />
        <Text style={styles.hint}>{availability === "online" ? "Teammates see you as Online." : "Teammates see you as Away."}</Text>
        {availError ? <Text style={styles.error} accessibilityRole="alert">{availError}</Text> : null}
      </View>

      <Text style={styles.sec}>APP</Text>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" onPress={() => void onPushRow()} style={styles.row}>
          <Text style={styles.rowText}>Notifications on this phone</Text>
          <Text style={styles.rowValue}>{pushStatus === "granted" ? "On" : pushStatus === "denied" ? "Off · Open settings" : "Turn on"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/canned-responses")} style={styles.row}>
          <Text style={styles.rowText}>Canned responses</Text>
        </Pressable>
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(config.webUrl)} style={styles.row}>
          <Text style={styles.rowText}>Open web dashboard</Text><Text style={styles.rowValue}>↗</Text>
        </Pressable>
      </View>
```

with styles (merge into the existing `StyleSheet.create`):

```ts
  sec: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, letterSpacing: 0.5, paddingHorizontal: space.xl, marginTop: space.xl, marginBottom: space.sm },
  hint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, marginTop: space.sm },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger, marginTop: 4 },
  card: { marginHorizontal: space.xl, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: "row", alignItems: "center", minHeight: 52, paddingHorizontal: space.lg, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  rowText: { flex: 1, fontFamily: font.regular, fontSize: 15, color: colors.text },
  rowValue: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
```

Make the Me screen scrollable (`<Screen title="Me" scroll>`). `me.availability` comes from the gate's `Me`; invalidating `["gate", userId]` refreshes it (the gate keeps its data while refetching, so the screen doesn't flash).

- [ ] **Step 7: Verify and commit**

Run: `pnpm jest && pnpm tsc --noEmit && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`

```bash
git add apps/mobile/lib apps/mobile/app/\(app\)/notifications.tsx apps/mobile/app/\(app\)/canned-responses.tsx apps/mobile/app/\(app\)/\(tabs\)/me.tsx
git commit -m "feat(mobile): notifications feed and Me tab — availability, phone notifications, canned responses, web link

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

## Follow-ups (not in this plan)

- Bell icon unread dot on Inbox/Dashboard headers (from `["notifications"]` `unreadCount`).
- Web bug (separate fix): the web inbox "Closed" tab sends `status=closed`, which is not a conversation status (the API uses `resolved`).
- Owner device test of Plans 2–4 together (same build): dashboard ranges, campaign pause/resume/abort on a test campaign, templates list, add/edit contact, notifications tap-through, Away status shows on the web.
